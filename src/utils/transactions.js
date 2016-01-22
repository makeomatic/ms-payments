const moment = require('moment');
const key = require('../redisKey.js');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const Promise = require('bluebird');

function convertDate(strDate) {
  return moment(strDate).valueOf();
}

function saveCommon(data) {
  const { redis } = this;
  const prefix = (data.type === 0) && 'sale' || 'subscription';
  const transactionKey = `${prefix}-${data.id}`;
  const dataKey = key('all-transactions', transactionKey);
  const userIndex = key(data.owner, 'transactions');
  const allIndex = 'all-transactions';

  const pipeline = redis.pipeline();

  // set main data
  pipeline.hmset(dataKey, mapValues(data, JSONStringify));

  // add id to indexes
  pipeline.sadd(allIndex, transactionKey);
  pipeline.sadd(userIndex, transactionKey);

  return pipeline.exec().return(data);
}

function parseSale(sale, owner) {
  // to catch errors automatically
  return Promise.try(() => {
    // reasonable default?
    const payer = sale.payer.payer_info && sale.payer.payer_info.email || owner;
    return {
      id: sale.id,
      type: 0,
      owner,
      payer,
      date: convertDate(sale.create_time),
      amount: sale.transactions[0].amount.total,
      description: sale.transactions[0].description,
      status: sale.status,
    };
  });
}

function parseAgreement(transaction, owner) {
  return Promise.try(() => {
    return {
      id: transaction.transaction_id,
      type: 1,
      owner,
      payer: transaction.payer_email,
      date: convertDate(transaction.time_stamp),
      amount: transaction.amount.value,
      description: `Recurring payment of ${transaction.amount.value} USD for [${owner}]`,
      status: transaction.status,
    };
  });
}

module.exports = exports = {
  saveCommon,
  parseSale,
  parseAgreement,
};
