const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');

function transactionSync(message) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.searchTransactions(message.id, message.start, message.end, _config.paypal, (error, transactions) => {
        if (error) {
          reject(error);
        } else {
          resolve(transactions);
        }
      });
    });
  }

  function saveToRedis(transactions) {
    const pipeline = redis.pipeline;

    ld.forEach(transactions, (transaction) => {
      const planKey = key('transaction-data', transaction.transaction_id);

      pipeline.hsetnx(planKey, 'transactions', JSON.stringify(transaction));
      pipeline.hsetnx(planKey, 'status', transaction.status);
      pipeline.hsetnx(planKey, 'transaction_type', transaction.transaction_type);
      pipeline.hsetnx(planKey, 'payer_email', transaction.payer_email);
      pipeline.hsetnx(planKey, 'time_stamp', transaction.time_stamp);
      pipeline.hsetnx(planKey, 'time_zone', transaction.time_zone);
      pipeline.hsetnx(planKey, 'owner', message.owner);

      pipeline.sadd('transaction-index', transaction.transaction_id);
    });

    return pipeline.exec().then(() => {
      return transactions;
    });
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
