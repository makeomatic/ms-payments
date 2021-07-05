const { ActionTransport } = require('@microfleet/core');

const moment = require('moment');

const { BillingError, AgreementStatusError } = require('../../utils/paypal/agreements').error;
const paypal = require('../../utils/paypal');

const { getStoredAgreement, verifyAgreementState, updateAgreement } = require('../../utils/paypal/agreements');
const { syncTransactions } = require('../../utils/paypal/transactions');

// constants
const HOOK_BILLING_SUCCESS = 'paypal:agreements:billing:success';
const HOOK_BILLING_FAILURE = 'paypal:agreements:billing:failure';

const paidAgreementPayload = (agreement, state, owner) => ({
  owner,
  id: agreement.id,
  status: state.toLowerCase(),
});

async function publishHook(amqp, event, payload) {
  await amqp.publish('payments.hook.publish', { event, payload }, {
    confirm: true,
    mandatory: true,
    deliveryMode: 2,
    priority: 0,
  });
}

function getAgreementDetails(agreement) {
  const { agreement_details: agreementDetails } = agreement;

  return {
    failedPayments: parseInt(agreementDetails.failed_payment_count, 10) || 0,
    cyclesCompleted: parseInt(agreementDetails.cycles_completed, 10) || 0,
  };
}

/**
 * @api {AMQP,internal} agreement.bill Bill agreement
 * @apiVersion 1.0.0
 * @apiName billAgreement
 * @apiGroup Agreement
 * @apiDescription Bills requested agreement
 * @apiSchema {jsonschema=agreement/bill.json} apiRequest
 * @apiSchema {jsonschema=response/agreement/bill.json} apiResponse
 */
async function agreementBill({ log, params }) {
  const { agreement: id, username: owner, subscriptionInterval } = params;
  const { amqp } = this;

  log.debug('billing %s on %s', owner, id);

  const { paypal: paypalConfig } = this.config;
  const localAgreementData = await getStoredAgreement(this, id);
  const remoteAgreement = await paypal.agreement.get(id, paypalConfig).catch(paypal.handleError);

  const now = moment();
  const start = now.clone().subtract(2, subscriptionInterval).format('YYYY-MM-DD');
  const end = now.clone().add(1, 'day').format('YYYY-MM-DD');

  // initially sync transactions anyway
  const transactions = await syncTransactions(this.dispatch, id, owner, start, end);

  try {
    verifyAgreementState(id, owner, remoteAgreement.state);
  } catch (error) {
    if (error instanceof BillingError || error instanceof AgreementStatusError) {
      log.warn({ err: error }, 'Agreement %s was cancelled by user %s', id, owner);

      await updateAgreement(this, localAgreementData, remoteAgreement);
      await publishHook(amqp, HOOK_BILLING_FAILURE, {
        error: error.getHookErrorData(),
      });

      return 'FAIL';
    }
    log.warn({ err: error }, 'Failed to sync', owner, id);
    throw error;
  }

  const local = getAgreementDetails(localAgreementData.agreement);
  const remote = getAgreementDetails(remoteAgreement);
  const failedPaymentsDiff = remote.failedPayments - local.failedPayments;
  const cyclesBilled = remote.cyclesCompleted - local.cyclesCompleted;

  if (failedPaymentsDiff > 0) {
    const error = BillingError.hasIncreasedPaymentFailure(id, owner, {
      local: local.failedPayments,
      remote: remote.failedPayments,
    });
    log.debug({ err: error }, 'Failed payment increase');

    await updateAgreement(this, localAgreementData, remoteAgreement);
    await publishHook(amqp, HOOK_BILLING_FAILURE, {
      error: error.getHookErrorData(),
    });

    return 'FAIL';
  }

  const agreementPayload = paidAgreementPayload(localAgreementData.agreement, remoteAgreement.state, owner);

  // try to find transaction
  const cycleStart = moment(remoteAgreement.agreement_details.next_billing_date).subtract(1, subscriptionInterval);
  const transaction = transactions.find((t) => moment(t.time_stamp).isAfter(cycleStart));

  // update agreement only when transaction data is available
  // otherwise agreement should be treated as unbilled
  if (transaction) {
    await updateAgreement(this, localAgreementData, remoteAgreement);
  }

  // cyclesBilled === 0 forces billing to retry request
  await publishHook(amqp, HOOK_BILLING_SUCCESS, {
    agreement: agreementPayload,
    transaction: cyclesBilled > 0 ? transaction : undefined,
    cyclesBilled: transaction ? cyclesBilled : 0,
  });

  return 'OK';
}

agreementBill.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = agreementBill;
