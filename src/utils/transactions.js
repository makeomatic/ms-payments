const moment = require('moment');
const key = require('../redisKey.js');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const Promise = require('bluebird');
const {
  TRANSACTION_TYPE_RECURRING,
  TRANSACTION_TYPE_SALE,
  TRANSACTIONS_INDEX,
  TRANSACTIONS_COMMON_DATA,
} = require('../constants.js');

function convertDate(strDate) {
  return moment(strDate).valueOf();
}

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

function parseSale(sale, owner) {
  // to catch errors automatically
  return Promise.try(() => {
    // reasonable default?
    const payer = sale.payer.payer_info && sale.payer.payer_info.email || owner;
    return {
      id: sale.id,
      type: TRANSACTION_TYPE_SALE,
      owner,
      payer,
      date: convertDate(sale.create_time),
      amount: sale.transactions[0].amount.total,
      description: sale.transactions[0].description,
      status: sale.state,
    };
  });
}

function parseAgreement(transaction, owner) {
  return Promise.try(() => ({
    id: transaction.transaction_id,
    type: TRANSACTION_TYPE_RECURRING,
    owner,
    payer: transaction.payer_email,
    date: convertDate(transaction.time_stamp),
    amount: transaction.amount.value,
    description: `Recurring payment of ${transaction.amount.value} USD for [${owner}]`,
    status: transaction.state,
  }));
}

module.exports = exports = {
  saveCommon,
  parseSale,
  parseAgreement,
};
