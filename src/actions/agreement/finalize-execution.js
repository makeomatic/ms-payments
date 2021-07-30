const { ActionTransport } = require('@microfleet/core');

const paypal = require('../../utils/paypal');

const { ExecutionIncompleteError } = require('../../utils/paypal/agreements').error;
const { updateAgreement } = require('../../utils/paypal/agreements');
const { publishFinalizationFailureHook, publishFinalizationSuccessHook, successExecutionPayload } = require('../../utils/paypal/billing-hooks');
const { syncInitialTransaction } = require('../../utils/paypal/transactions');

/**
 * Resync agreement in case of Pending status or missing initial transaction
 */
async function finalizeExecution({ params }) {
  const { dispatch, amqp, config } = this;
  const { paypal: paypalConfig } = config;

  const { agreementId, owner } = params;

  const localAgreement = await dispatch('agreement.get', {
    params: { id: agreementId, owner },
  });

  const remoteAgreement = await paypal.agreement
    .get(agreementId, paypalConfig)
    .catch(paypal.handleError);

  const { filteredTransactions, transactionShouldExist } = await syncInitialTransaction(
    dispatch, localAgreement.agreement, localAgreement.owner, localAgreement.creatorTaskId
  );
  const [transaction] = filteredTransactions;

  // Agreement marked as fully executed only when transaction information is available
  // or transaction not required
  const agreementFinalized = !transactionShouldExist || filteredTransactions.length > 0;

  await updateAgreement(this, localAgreement, remoteAgreement, {
    finalizedAt: agreementFinalized ? Date.now() : undefined,
  });

  const payload = successExecutionPayload(
    localAgreement.agreement,
    localAgreement.token,
    localAgreement.owner,
    localAgreement.creatorTaskId,
    transactionShouldExist,
    transaction,
    agreementFinalized
  );

  this.log.debug('agreement finalize result', { payload, filteredTransactions, transactionShouldExist });

  if (agreementFinalized) {
    await publishFinalizationSuccessHook(amqp, payload);
  } else {
    await publishFinalizationFailureHook(amqp, payload);
    this.log.error(ExecutionIncompleteError.noTransaction(agreementId, owner, localAgreement.creatorTaskId));
  }

  return payload;
}

finalizeExecution.transports = [ActionTransport.amqp];

module.exports = finalizeExecution;
