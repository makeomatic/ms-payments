const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const Errors = require('common-errors');
const forEach = require('lodash/forEach');
const getValue = require('get-value');

// helpers
const key = require('../../redis-key');
const { serialize, deserialize, handlePipeline } = require('../../utils/redis');
const { parseAgreementTransaction, saveCommon } = require('../../utils/transactions');
const { AGREEMENT_DATA, AGREEMENT_TRANSACTIONS_INDEX, AGREEMENT_TRANSACTIONS_DATA } = require('../../constants');
const { agreement: { get: getAgreement, searchTransactions }, handleError } = require('../../utils/paypal');
const { mergeWithNotNull } = require('../../utils/plans');

/**
 * Helper functions
 */

/**
 * Gets agreement and transactions for the passed agreementId
 * @return object { agreement: {object}, transactions: [{object}] }
 */
async function sendRequest() {
  const {
    agreementId, paypalConfig, start, end,
  } = this;

  // we request agreement & transactions sequentially so that
  // if transactions request goes through first and contains non-finished transactions
  // but agreement is already in active state we dont get an inconsistency
  const agreement = await getAgreement(agreementId, paypalConfig).catch(handleError);
  const transactions = await searchTransactions(agreementId, start, end, paypalConfig)
    .catch(handleError)
    .get('agreement_transaction_list');

  return { agreement, transactions };
}

/**
 * Fetch owner of transactions from ms-users
 * @return {Promise<String>}
 */
async function findOwner() {
  // verify if we already have passed owner
  const { owner } = this;
  if (owner) {
    return owner;
  }

  const agreementRequest = {
    audience: this.audience,
    offset: 0,
    limit: 1,
    filter: {
      agreement: {
        eq: JSON.stringify(this.agreementId),
      },
    },
  };

  const userOfAgreement = await this.amqp
    .publishAndWait(this.usersListRoute, agreementRequest, { timeout: this.usersListTimeout })
    .get('users');

  if (userOfAgreement.length === 0) {
    throw new Errors.HttpStatusError(404, `Couldn't find user for agreement ${this.agreementId}`);
  }

  if (userOfAgreement.length !== 1) {
    throw new Errors.HttpStatusError(409, `Found multiple users for agreement ${this.agreementId}`);
  }

  return userOfAgreement[0].id;
}

/**
 * Fetch old agreement from redis
 * @return {Promise<{ agreement: Agreement }>}
 */
async function getOldAgreement() {
  const agreementKey = key(AGREEMENT_DATA, this.agreementId);
  const data = await this.redis.hgetall(agreementKey);

  return data
    ? deserialize(data)
    : null;
}

/**
 * Insert data about transaction into common list of sales and
 * @param  {Transaction} transaction
 * @param  {String} owner
 * @return {Promise<Transaction>}
 */
function updateCommon(transaction, owner) {
  const { agreementId, log } = this;

  return Promise
    .bind(this, parseAgreementTransaction(transaction, owner, agreementId))
    .then(saveCommon)
    .catch((err) => {
      log.error('failed to insert common transaction data', err);
    })
    .return(transaction);
}

/**
 * Save transaction's data to redis
 * @param  {String}  owner
 * @param  {Object<{ agreement, transactions }>}  paypalData
 * @return {Promise<{ agreement, transactions }>}
 */
function saveToRedis(owner, paypalData, oldAgreement) {
  const { redis, agreementId, log } = this;
  const { agreement, transactions } = paypalData;

  const pipeline = redis.pipeline();
  const updates = [];
  const agreementKey = key(AGREEMENT_DATA, agreement.id);

  log.info({ agreement, transactions }, 'received data from paypal');

  // update current agreement details
  pipeline.hmset(agreementKey, serialize({
    agreement: {
      ...agreement,
      plan: mergeWithNotNull(getValue(oldAgreement, 'agreement.plan'), agreement.plan),
    },
    state: agreement.state,
  }));

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
  updates.push(pipeline.exec().then(handlePipeline));

  return Promise.all(updates).return({ agreement, transactions });
}

/**
 * Invokes function
 * @param  {Function} fn
 * @return {Promise}
 */
function invoke(fn) {
  return fn.call(this);
}

/**
 * Syncs transactions for agreements
 * @param  {Object} params
 * @return {Promise}
 */
function transactionSync({ params }) {
  const { config, redis, amqp, log } = this;
  const { paypal: paypalConfig } = config;
  const { users: { prefix, postfix, audience, timeouts: { list: usersListTimeout } } } = config;
  const usersListRoute = `${prefix}.${postfix.list}`;
  const agreementId = params.id;

  const ctx = {
    // services
    log,
    redis,
    amqp,
    paypalConfig,

    // input attributes
    agreementId,
    usersListRoute,
    usersListTimeout,
    audience,
    start: params.start || '',
    end: params.end || '',
  };

  return Promise
    .bind(ctx, [findOwner, sendRequest, getOldAgreement])
    .map(invoke)
    .spread(saveToRedis);
}

transactionSync.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = transactionSync;
