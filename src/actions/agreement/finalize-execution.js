const { get } = require('lodash');
const moment = require('moment');
const Promise = require('bluebird');
const { ActionTransport } = require('@microfleet/core');

const { ExecutionIncompleteError } = require('../../utils/paypal/agreements').error;
const { publishSuccessHook, successPayload } = require('../../utils/paypal/billing-hooks');

async function syncTransactions(dispatch, log, agreement, owner, attempt = 0) {
  const syncInterval = get(agreement, ['plan', 'payment_definitions', '0', 'frequency'], 'year').toLowerCase();
  // we pass owner, so transaction.sync won't try to find user by agreement.id, which is OK as a tradeoff for now
  const { transactions } = await dispatch('transaction.sync', {
    params: {
      id: agreement.id,
      owner,
      start: moment().subtract(2, syncInterval).format('YYYY-MM-DD'),
      end: moment().add(1, 'day').format('YYYY-MM-DD'),
    },
  });

  const { setup_fee: setupFee } = agreement.plan.merchant_preferences;
  const floatSetupFee = parseFloat(setupFee.value);

  // filter out transaction with created status and id === agreement.id
  const filteredTransactions = transactions.filter((t) => t.transaction_id !== agreement.id);
  const transactionShouldExist = floatSetupFee > 0;

  if (transactionShouldExist && filteredTransactions.length === 0) {
    if (attempt > 50) {
      const error = ExecutionIncompleteError.noTransactionsAfter(agreement.id, owner, attempt);
      log.error({ err: error }, error.message);
      throw error;
    }
    log.warn({ attempt, agreement }, 'no transactions fetched for agreement');

    await Promise.delay(10000);

    return syncTransactions(dispatch, log, agreement, owner, attempt + 1);
  }

  return { transactionShouldExist, filteredTransactions };
}

async function finalizeTransactions({ params }) {
  const { dispatch, log, amqp } = this;
  const { agreementId, owner } = params;

  const agreement = await dispatch('agreement.get', {
    params: {
      id: agreementId, owner,
    },
  });

  try {
    const { filteredTransactions: [transaction] } = await syncTransactions(dispatch, log, agreement.agreement, owner);
    const payload = successPayload(agreement.agreement, agreement.token, owner, transaction);

    await publishSuccessHook(amqp, payload);
  } catch (error) {
    if (!(error instanceof ExecutionIncompleteError)) {
      throw error;
    }
  }

  return 'OK';
}

finalizeTransactions.transports = [ActionTransport.amqp];

module.exports = finalizeTransactions;
