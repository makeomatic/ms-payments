const { get } = require('lodash');
const moment = require('moment');

/**
 * Fetch transactions from PayPal for the period [start; end]
 * @param service
 * @param id Agreement ID
 * @param start
 * @param end
 * @param agreement
 * @returns {bluebird<[]>}
 */
async function syncTransactions(dispatch, agreementId, owner, start, end) {
  const { transactions } = await dispatch('transaction.sync', {
    params: {
      id: agreementId,
      owner,
      start,
      end,
    },
  });

  return transactions;
}

async function syncInitialTransaction(dispatch, agreement, owner) {
  const syncInterval = get(agreement, ['plan', 'payment_definitions', '0', 'frequency'], 'year').toLowerCase();
  const start = moment().subtract(2, syncInterval).format('YYYY-MM-DD');
  const end = moment().add(1, 'day').format('YYYY-MM-DD');

  const transactions = await syncTransactions(dispatch, agreement.id, owner, start, end);
  console.debug('INITIAL TRANSACTIONS', transactions);
  const { setup_fee: setupFee } = agreement.plan.merchant_preferences;
  const floatSetupFee = parseFloat(setupFee.value);

  // filter out transaction with created status and id === agreement.id
  const filteredTransactions = transactions.filter((t) => t.transaction_id !== agreement.id);
  const transactionShouldExist = floatSetupFee > 0;

  return { transactionShouldExist, filteredTransactions };
}

module.exports = {
  syncTransactions,
  syncInitialTransaction,
};
