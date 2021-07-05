// internal actions
const { agreement: { get: getAgreement } } = require('../../paypal');

const { AgreementStatusError } = require('./error');

/**
 * Fetches updated agreement from paypal.
 * We must make sure that state is 'active'.
 * If it's pending -> retry until it becomes either active or cancelled
 * States: // Active, Cancelled, Completed, Created, Pending, Reactivated, or Suspended
 * @param  {string} agreementId - Agreement Id.
 */
async function fetchUpdatedAgreement(paypal, log, agreementId, owner, creatorTaskId) {
  const agreement = await getAgreement(agreementId, paypal);
  log.debug('fetched agreement %j', agreement);
  const state = String(agreement.state).toLowerCase();

  if (state === 'active') {
    return agreement;
  }

  if (state === 'pending') {
    log.warn({ agreement }, 'failed to move agreement to active/failed state');
    return agreement;
  }

  const error = new AgreementStatusError(agreementId, owner, state, creatorTaskId);
  log.error({ err: error, agreement }, 'Client tried to execute failed agreement: %j');
  throw error;
}

module.exports = {
  fetchUpdatedAgreement,
};
