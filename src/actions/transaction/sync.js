const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const forEach = require('lodash/forEach');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const searchTransactions = Promise.promisify(paypal.billingAgreement.searchTransactions, { context: paypal.billingAgreement }); // eslint-disable-line
const { parseAgreement, saveCommon } = require('../../utils/transactions');
const { NotFoundError } = require('common-errors');

function transactionSync(message) {
  const { _config, redis, amqp, log } = this;
  const { paypal: paypalConfig } = _config;
  const { users: { prefix, postfix, audience } } = _config;
  const path = `${prefix}.${postfix.list}`;
  const agreementId = message.id;

  // perform search of transactions
  function sendRequest() {
    return searchTransactions(message.id, message.start || '', message.end || '', paypalConfig);
  }

  // find owner of transaction by asking users.list
  function findOwner() {
    const getRequest = {
      audience,
      offset: 0,
      limit: 1,
      filter: {
        agreement: {
          eq: JSON.stringify(agreementId),
        },
      },
    };

    return amqp
      .publishAndWait(path, getRequest, { timeout: 5000 })
      .get('users')
      .then(users => {
        if (users.length > 0) {
          return users[0].id;
        }

        throw new NotFoundError('Couldn\'t find user for agreement');
      });
  }

  // insert data about transaction into common list of sales and
  function updateCommon(agreement, owner) {
    return Promise
      .bind(this, parseAgreement(agreement, owner))
      .then(saveCommon)
      .catch(err => {
        log.error('failed to insert common transaction data', err);
      })
      .return(agreement);
  }

  // save transaction's data to redis
  function saveToRedis(owner, transactions) {
    const pipeline = redis.pipeline();
    const updates = [];

    // gather updates
    forEach(transactions, transaction => {
      const transactionKey = key('transaction-data', transaction.transaction_id);
      const data = {
        transaction,
        owner,
        agreement: message.id,
        status: transaction.status,
        transaction_type: transaction.transaction_type,
        payer_email: transaction.payer_email,
        time_stamp: transaction.time_stamp,
        time_zone: transaction.time_zone,
      };

      pipeline.hmset(transactionKey, mapValues(data, JSONStringify));
      pipeline.sadd('transaction-index', transaction.transaction_id);

      updates.push(updateCommon.call(this, transaction, owner));
    });

    // gather pipeline transaction
    updates.push(pipeline.exec());

    return Promise.all(updates).return(transactions);
  }

  return Promise.join(
    findOwner(),
    sendRequest()
  )
  .bind(this)
  .spread(saveToRedis);
}

module.exports = transactionSync;
