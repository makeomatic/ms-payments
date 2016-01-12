const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');

function transactionSync(message) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.searchTransactions(message.id, message.start || '', message.end || '', _config.paypal, (error, transactions) => {
        if (error) {
          return reject(error);
        }

        return resolve(transactions);
      });
    });
  }

  function saveToRedis(transactions) {
    const pipeline = redis.pipeline();

    ld.map(transactions, (transaction) => {
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

      pipeline.hmset(transactionKey, ld.mapValues(data, JSON.stringify, JSON));
      pipeline.sadd('transaction-index', transaction.transaction_id);
    });

    return pipeline.exec().return(transactions);
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
