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
          return reject(error);
        }

        return resolve(transactions);
      });
    });
  }

  function saveToRedis(transactions) {
    const pipeline = redis.pipeline();

    ld.forEach(transactions, (transaction) => {
      const transactionKey = key('transaction-data', transaction.transaction_id);

      pipeline.hset(transactionKey, 'transaction', JSON.stringify(transaction));
      pipeline.hset(transactionKey, 'agreement', message.id);
      pipeline.hset(transactionKey, 'status', transaction.status);
      pipeline.hset(transactionKey, 'transaction_type', transaction.transaction_type);
      pipeline.hset(transactionKey, 'payer_email', transaction.payer_email);
      pipeline.hset(transactionKey, 'time_stamp', transaction.time_stamp);
      pipeline.hset(transactionKey, 'time_zone', transaction.time_zone);
      pipeline.hset(transactionKey, 'owner', message.owner);

      pipeline.sadd('transaction-index', transaction.transaction_id);
    });

    return pipeline.exec().return(transactions);
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
