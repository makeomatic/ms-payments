const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const map = require('lodash/map');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const searchTransactions = Promise.promisify(paypal.billingAgreement.searchTransactions, { context: paypal.billingAgreement }); // eslint-disable-line
const { parseAgreement, saveCommon } = require('../../utils/transactions');
const { NotFoundError } = require('common-errors');

function transactionSync(message) {
  const { _config, redis, amqp } = this;
  const { paypal: paypalConfig } = _config;
  const promise = Promise.bind(this);
  // yaYA! Tem dislik side effekt
  // but Tem neds to go to coleg fast
  let owner = null;

  function sendRequest() {
    return searchTransactions(message.id, message.start || '', message.end || '', paypalConfig);
  }

  function findOwner() {
    if (owner) {
      return owner;
    }

    const path = _config.users.prefix + '.' + _config.users.postfix.list;
    const getRequest = {
      offset: 0,
      limit: 1,
      filter: {
        eq: {
          agreement: JSON.stringify(message.id),
        },
      },
    };

    return amqp.publishAndWait(path, getRequest, { timeout: 5000 }).get('users').then((users) => {
      if (users.length > 0) {
        owner = users[0];
        return owner;
      }
      throw new NotFoundError('Couldn\'t find user for agreement');
    });
  }

  function updateCommon(agreement, owner) {
    return Promise.bind(this, parseAgreement(agreement, owner)).then(saveCommon).return(agreement);
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

    const updates = map(transactions, transaction => {
      return findOwner().bind(this).then((owner) => {
        updateCommon(transaction, owner);
      });
    }, this);

    // yaYA! Tem sad, very ugly
    return Promise.all([pipeline.exec().return(transactions)].concat(updates));
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
