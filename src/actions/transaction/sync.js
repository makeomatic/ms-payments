const Promise = require('bluebird');
const Errors = require('common-errors');
const paypal = require('paypal-rest-sdk');
const forEach = require('lodash/forEach');

// helpers
const key = require('../../redisKey.js');
const { serialize } = require('../../utils/redis.js');
const { parseAgreementTransaction, saveCommon } = require('../../utils/transactions');
const { AGREEMENT_DATA, AGREEMENT_TRANSACTIONS_INDEX, AGREEMENT_TRANSACTIONS_DATA } = require('../../constants.js');

// paypal
const searchTransactions = Promise.promisify(paypal.billingAgreement.searchTransactions, { context: paypal.billingAgreement });
const getAgreement = Promise.promisify(paypal.billingAgreement.get, { context: paypal.billingAgreement });

function transactionSync({ params: message }) {
  const { _config, redis, amqp, log } = this;
  const { paypal: paypalConfig } = _config;
  const { users: { prefix, postfix, audience } } = _config;
  const path = `${prefix}.${postfix.list}`;
  const agreementId = message.id;

  // perform search of transactions
  function sendRequest() {
    return Promise.props({
      agreement: getAgreement(agreementId, paypalConfig),
      transactions: searchTransactions(agreementId, message.start || '', message.end || '', paypalConfig).get('agreement_transaction_list'),
    })
    .catch((err) => {
      throw new Errors.HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
    });
  }

  // find owner of transaction by asking users.list
  function findOwner() {
    if (message.owner) {
      return message.owner;
    }

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
      .then((users) => {
        if (users.length > 0) {
          return users[0].id;
        }

        throw new Errors.HttpStatusError(404, `Couldn't find user for agreement ${agreementId}`);
      });
  }

  // insert data about transaction into common list of sales and
  function updateCommon(transaction, owner) {
    return Promise
      .bind(this, parseAgreementTransaction(transaction, owner, agreementId))
      .then(saveCommon)
      .catch((err) => {
        log.error('failed to insert common transaction data', err);
      })
      .return(transaction);
  }

  // save transaction's data to redis
  function saveToRedis(owner, { agreement, transactions }) {
    const pipeline = redis.pipeline();
    const updates = [];
    const agreementKey = key(AGREEMENT_DATA, agreement.id);

    // update current agreement details
    pipeline.hmset(agreementKey, serialize({ agreement, state: agreement.state }));

    // gather updates
    forEach(transactions, (transaction) => {
      const transactionKey = key(AGREEMENT_TRANSACTIONS_DATA, transaction.transaction_id);
      const data = {
        transaction,
        owner,
        agreement: agreementId,
        status: transaction.status,
        transaction_type: transaction.transaction_type,
        payer_email: transaction.payer_email || undefined,
        time_stamp: new Date(transaction.time_stamp).getTime(),
      };

      pipeline.hmset(transactionKey, serialize(data));
      pipeline.sadd(AGREEMENT_TRANSACTIONS_INDEX, transaction.transaction_id);

      updates.push(updateCommon.call(this, transaction, owner));
    });

    // gather pipeline transaction
    updates.push(pipeline.exec());

    return Promise.all(updates).return({ agreement, transactions });
  }

  return Promise
    .join(findOwner(), sendRequest())
    .bind(this)
    .spread(saveToRedis);
}

module.exports = transactionSync;
