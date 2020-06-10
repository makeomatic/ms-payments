const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const Errors = require('common-errors');
const get = require('get-value');

// helpers
const key = require('../../redis-key');
const { serialize, deserialize, handlePipeline } = require('../../utils/redis');
const { parseAgreementTransaction, saveCommon } = require('../../utils/transactions');
const {
  AGREEMENT_DATA,
  AGR_TX_FIELD,
  PER_AGREEMENT_TX_IDX,
  AGREEMENT_TRANSACTIONS_INDEX,
  AGREEMENT_TRANSACTIONS_DATA,
  ARG_AGR_ID_FIELD,
} = require('../../constants');
const { agreement: { get: getAgreement, searchTransactions }, handleError } = require('../../utils/paypal');
const { mergeWithNotNull } = require('../../utils/plans');

/**
 * Helper functions
 */

/**
 * Gets transactions for the passed agreementId
 * @return {Promise<{ agreement: Agreement, transactions: Transactions[] }>}
 */
async function sendRequest(ctx) {
  const { agreementId, paypalConfig, start, end } = ctx;

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
async function findOwner(ctx) {
  // verify if we already have passed owner
  const { owner } = ctx;
  if (owner) {
    return owner;
  }

  const getRequest = {
    audience: ctx.audience,
    offset: 0,
    limit: 1,
    filter: {
      agreement: {
        eq: JSON.stringify(ctx.agreementId),
      },
    },
  };

  const users = await ctx.amqp
    .publishAndWait(ctx.path, getRequest, { timeout: 5000 })
    .get('users');

  if (users.length === 0) {
    throw new Errors.HttpStatusError(404, `Couldn't find user for agreement ${ctx.agreementId}`);
  }

  if (users.length !== 1) {
    throw new Errors.HttpStatusError(409, `Multipel users for agreement ${ctx.agreementId}`);
  }

  return users[0].id;
}

/**
 * Fetch old agreement from redis
 * @return {Promise<{ agreement: Agreement }>}
 */
async function getOldAgreement(ctx) {
  const agreementKey = key(AGREEMENT_DATA, ctx.agreementId);
  const data = await ctx.redis.hgetall(agreementKey);

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
function updateCommon(ctx, transaction, owner) {
  const { agreementId, log } = ctx;

  return Promise
    .bind(ctx, parseAgreementTransaction(transaction, owner, agreementId))
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
async function saveToRedis(ctx, owner, paypalData, oldAgreement) {
  const { redis, agreementId, log } = ctx;
  const { agreement, transactions } = paypalData;

  const pipeline = redis.pipeline();
  const updates = [];
  const agreementKey = key(AGREEMENT_DATA, agreement.id);

  log.info({ agreement, transactions }, 'received data from paypal');

  // update current agreement details
  pipeline.hmset(agreementKey, serialize({
    agreement: {
      ...agreement,
      plan: mergeWithNotNull(get(oldAgreement, ['agreement', 'plan']), agreement.plan),
    },
    state: agreement.state,
  }));

  for (const transaction of transactions.values()) {
    const transactionKey = key(AGREEMENT_TRANSACTIONS_DATA, transaction.transaction_id);
    const agreementTxListKey = key(PER_AGREEMENT_TX_IDX, agreementId);
    const data = {
      transaction,
      owner,
      [ARG_AGR_ID_FIELD]: agreementId,
      status: transaction.status,
      transaction_type: transaction.transaction_type,
      payer_email: transaction.payer_email || undefined,
      time_stamp: new Date(transaction.time_stamp).getTime(),
    };

    pipeline.hmset(transactionKey, serialize(data));
    pipeline.sadd(AGREEMENT_TRANSACTIONS_INDEX, transaction.transaction_id);

    updates.push(redis.storeTx(2, agreementKey, agreementTxListKey, transaction.transaction_id, AGR_TX_FIELD));
    updates.push(updateCommon(ctx, transaction, owner));
  }

  // gather pipeline transaction
  updates.push(pipeline.exec().then(handlePipeline));

  await Promise.all(updates);

  return { agreement, transactions };
}

/**
 * Syncs transactions for agreements
 * @param  {Object} params
 * @return {Promise}
 */
async function transactionSync({ params }) {
  const { config, redis, amqp, log } = this;
  const { paypal: paypalConfig } = config;
  const { users: { prefix, postfix, audience } } = config;
  const path = `${prefix}.${postfix.list}`;
  const agreementId = params.id;

  const ctx = {
    // services
    log,
    redis,
    amqp,
    paypalConfig,

    // input attributes
    agreementId,
    path,
    audience,

    owner: params.owner,
    start: params.start,
    end: params.end,
  };

  const args = await Promise.all([
    findOwner(ctx),
    sendRequest(ctx),
    getOldAgreement(ctx),
  ]);

  return saveToRedis(ctx, ...args);
}

transactionSync.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = transactionSync;
