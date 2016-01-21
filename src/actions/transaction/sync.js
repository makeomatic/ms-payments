const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const map = require('lodash/map');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const searchTransactions = Promise.promisify(paypal.billingAgreement.searchTransactions, { context: paypal.billingAgreement }); // eslint-disable-line

function transactionSync(message) {
  const { _config, redis } = this;
  const { paypal: paypalConfig } = _config;
  const promise = Promise.bind(this);

  function sendRequest() {
    return searchTransactions(message.id, message.start || '', message.end || '', paypalConfig);
  }

  function saveToRedis(transactions) {
    const pipeline = redis.pipeline();

    map(transactions, transaction => {
      const transactionKey = key('transaction-data', transaction.transaction_id);
      const data = {
        transaction,
        agreement: message.id,
        status: transaction.status,
        transaction_type: transaction.transaction_type,
        payer_email: transaction.payer_email,
        time_stamp: transaction.time_stamp,
        time_zone: transaction.time_zone,
        owner: message.owner,
      };

      pipeline.hmset(transactionKey, mapValues(data, JSONStringify));
      pipeline.sadd('transaction-index', transaction.transaction_id);
    });

    return pipeline.exec().return(transactions);
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
