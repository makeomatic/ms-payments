const { ActionTransport } = require('@microfleet/core');
const get = require('get-value');
const moment = require('moment');

const { BillingError } = require('../../utils/paypal/agreements').error;
const paypal = require('../../utils/paypal');

// helpers
const key = require('../../redis-key');
const { hmget } = require('../../list-utils');
const { serialize } = require('../../utils/redis');
const { mergeWithNotNull } = require('../../utils/plans');
const { AGREEMENT_DATA } = require('../../constants');

// constants
const AGREEMENT_KEYS = ['agreement', 'plan', 'owner', 'state'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);

const HOOK_BILLING_SUCCESS = 'paypal:agreements:billing:success';
const HOOK_BILLING_FAILURE = 'paypal:agreements:billing:failure';

const paidAgreementPayload = (agreement, state, owner) => ({
  owner,
  id: agreement.id,
  status: state.toLowerCase(),
});
const kBannedStates = ['cancelled', 'suspended'];
const verifyAgreementState = (id, owner, state) => {
  // why could it be in uppercase anyway?
  if (!state || kBannedStates.includes(state.toLowerCase())) {
    throw BillingError.agreementStatusForbidden(id, owner, state.toLowerCase());
  }
};

/**
 * Fetch transactions from PayPal for the period [start; end]
 * @param service
 * @param id Agreement ID
 * @param start
 * @param end
 * @param agreement
 * @returns {bluebird<[]>}
 */
async function getActualTransactions(service, agreementId, owner, start, end) {
  const { transactions } = await service.dispatch('transaction.sync', {
    params: {
      id: agreementId,
      owner,
      start,
      end,
    },
  });

  return transactions;
}

/**
 * Parses and completes agreement data retrieved from redis
 * @param  {Object} service - current microfleet
 * @param  {String} id - agreement id
 * @return {Object} agreement
 * @throws DataError When agreement data cannot be parsed
 */
async function getStoredAgreement(service, id) {
  const { redis, log } = service;
  const agreementKey = key(AGREEMENT_DATA, id);
  const data = await redis.hmget(agreementKey, AGREEMENT_KEYS);

  try {
    const parsed = agreementParser(data);
    // NOTE: PAYPAL agreement doesn't have embedded plan id and owner...
    parsed.agreement.owner = parsed.owner;
    parsed.agreement.plan.id = parsed.plan;

    return parsed;
  } catch (e) {
    log.error({
      err: e, keys: AGREEMENT_KEYS, source: String(data), agreementKey,
    }, 'failed to fetch agreement data');

    throw e;
  }
}

async function updateAgreement(service, oldAgreement, newAgreement) {
  const agreementKey = key(AGREEMENT_DATA, newAgreement.id);
  await service.redis.hmset(agreementKey, serialize({
    agreement: {
      ...newAgreement,
      plan: mergeWithNotNull(get(oldAgreement, ['agreement', 'plan']), newAgreement.plan),
    },
    state: newAgreement.state,
  }));
}

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

  await updateAgreement(this, localAgreementData, remoteAgreement);

  const now = moment();
  const start = now.subtract(2, subscriptionInterval).format('YYYY-MM-DD');
  const end = now.add(1, 'day').format('YYYY-MM-DD');

  await getActualTransactions(this, id, owner, start, end);

  try {
    verifyAgreementState(id, owner, remoteAgreement.state);
  } catch (error) {
    if (error instanceof BillingError) {
      log.warn({ err: error }, 'Agreement %s was cancelled by user %s', id, owner);

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

  if (cyclesBilled === 0 && failedPaymentsDiff > 0) {
    const error = BillingError.hasIncreasedPaymentFailure(id, owner, {
      local: local.failedPayments,
      remote: remote.failedPayments,
    });
    log.debug({ err: error }, 'Failed payment increase');

    await publishHook(amqp, HOOK_BILLING_FAILURE, {
      error: error.getHookErrorData(),
    });

    return 'FAIL';
  }

  const agreementPayload = paidAgreementPayload(localAgreementData.agreement, remoteAgreement.state, owner);

  await publishHook(amqp, HOOK_BILLING_SUCCESS, {
    agreement: agreementPayload,
    cyclesBilled,
  });

  return 'OK';
}

agreementBill.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = agreementBill;
