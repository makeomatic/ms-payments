const key = require('../redisKey.js');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const Promise = require('bluebird');
const FIND_OWNER_REGEXP = /\[([^\]]+)\]/;
const getPath = require('lodash/get');
const {
  TRANSACTION_TYPE_RECURRING,
  TRANSACTION_TYPE_SALE,
  TRANSACTIONS_INDEX,
  TRANSACTIONS_COMMON_DATA,
} = require('../constants.js');

function getTransactionType(type) {
  switch (type) {
    case TRANSACTION_TYPE_RECURRING:
      return 'subscription';
    case TRANSACTION_TYPE_SALE:
      return 'sale';
    default:
      throw new Error('unsupported transaction type');
  }
}

// required:
// 1. type {Number}
// 2. id {String}
function saveCommon(data) {
  const { redis } = this;
  const transactionType = getTransactionType(data.type);

  // 1. add to common index
  // 2. add to transaction type index
  // 3. add to user type index
  // 4. add to user+transaction type index

  const { id } = data;
  const pipeline = redis.pipeline();
  const transactionTypeIndex = key(TRANSACTIONS_INDEX, transactionType);
  const userIndex = data.owner && key(TRANSACTIONS_INDEX, data.owner);
  const userTransactionTypeIndex = userIndex && key(userIndex, transactionType);

  // 5. store metadata data at this prefix
  const dataKey = key(TRANSACTIONS_COMMON_DATA, id);

  pipeline.sadd(TRANSACTIONS_INDEX, id);
  pipeline.sadd(transactionTypeIndex, id);
  pipeline.hmset(dataKey, mapValues(data, JSONStringify));

  if (userIndex) {
    pipeline.sadd(userIndex, id);
    pipeline.sadd(userTransactionTypeIndex, id);
  }

  return pipeline.exec().return(data);
}

function formatItemList({ items }) {
  return items.map(({ name, price, quantity, currency }) => (
    `${name} x${quantity} for ${parseFloat(price) * quantity} ${currency}.`
  )).join('\n');
}

function prepareDescription(amount, owner, state) {
  if (!amount) {
    return `${state} agreement with ${owner}`;
  }

  return `Recurring payment of ${amount.value} USD for ${owner}`;
}

// FIXME: retarded paypal bug, hopefully it is fixed in the future
function remapState(state) {
  return state === 'approved_symphony' ? 'approved' : state;
}

function parseSale(sale, owner) {
  // to catch errors automatically
  return Promise.try(() => {
    // reasonable default?
    const payer = sale.payer.payer_info && sale.payer.payer_info.email || owner;
    const [transaction] = sale.transactions;

    return {
      id: sale.id,
      type: TRANSACTION_TYPE_SALE,
      owner,
      payer,
      date: new Date(sale.create_time).getTime(),
      update_time: new Date(sale.update_time || sale.create_time).getTime(),
      amount: transaction.amount.total,
      currency: transaction.amount.currency,
      description: formatItemList(transaction.item_list),
      // Payment state. Must be set to one of the one of the following: created; approved; failed; canceled; expired; pending.
      // Value assigned by PayPal.
      status: remapState(sale.state),
    };
  });
}

function parseAgreementTransaction(transaction, owner, agreementId) {
  return Promise.try(() => ({
    id: transaction.transaction_id,
    type: TRANSACTION_TYPE_RECURRING,
    owner,
    agreementId,
    payer: transaction.payer_email || undefined,
    date: new Date(transaction.time_stamp).getTime(),
    amount: transaction.amount && transaction.amount.value || '0.00',
    description: prepareDescription(transaction.amount, owner, transaction.status),
    status: transaction.status,
  }));
}

function getOwner(sale) {
  const description = getPath(sale, 'transactions[0].item_list.items[0].name', false);
  const result = description && FIND_OWNER_REGEXP.exec(description);
  return result && result[1] || sale.payer_info && sale.payer_info.email || null;
}

module.exports = exports = {
  getOwner,
  saveCommon,
  parseSale,
  parseAgreementTransaction,
  remapState,
};
