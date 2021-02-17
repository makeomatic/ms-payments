const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const moment = require('moment');
const pick = require('lodash/pick');

// helpers
const key = require('../../redis-key');
const { AGREEMENT_INDEX, AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');
const { serialize, deserialize, handlePipeline } = require('../../utils/redis');
const { mergeWithNotNull } = require('../../utils/plans');
const { ExecutionError, ExecutionIncompleteError } = require('../../utils/paypal/agreements').error;
const { RequestError } = require('../../utils/paypal/client').error;

// internal actions
const { agreement: { execute, get: getAgreement } } = require('../../utils/paypal');

const freeAgreementPayload = (username) => ({
  id: 'free',
  owner: username,
  status: 'active',
});
const paidAgreementPayload = (agreement, state, owner) => ({
  owner,
  id: agreement.id,
  status: state.toLowerCase(),
});

const publishHook = (amqp, event, payload) => amqp.publish(
  'payments.hook.publish',
  { event, payload },
  {
    confirm: true,
    mandatory: true,
    deliveryMode: 2,
    priority: 0,
  }
);

const successEvent = 'paypal:agreements:execution:success';
const failureEvent = 'paypal:agreements:execution:failure';
const publishSuccessHook = (amqp, payload) => publishHook(amqp, successEvent, payload);
const publishFailureHook = (amqp, executionError) => publishHook(
  amqp,
  failureEvent,
  { error: pick(executionError, ['message', 'code', 'params']) }
);

/**
 * @throws ExecutionError Unknown subscription token
 */
async function findAgreementData(redis, amqp, token) {
  const tokenKey = key('subscription-token', token);
  const [exists, data] = await redis
    .pipeline()
    .exists(tokenKey)
    .hgetall(tokenKey)
    .exec()
    .then(handlePipeline);

  if (!exists) {
    throw ExecutionError.unknownSubscriptionToken(token);
  }

  return deserialize(data);
}

/**
 * @throws ExecutionError Paypal request failed for expected reason
 * @throws RequestError   Paypal request failed for any other reason
 */
async function sendRequest(token, paypal) {
  let result;
  try {
    result = await execute(token, {}, paypal);
  } catch (error) {
    const wrapper = RequestError.wrapOrigin(error);
    if (wrapper.isTokenInvalidError()) {
      throw ExecutionError.invalidSubscriptionToken(token);
    }
    throw wrapper;
  }

  return result.id;
}

/**
 * Fetches updated agreement from paypal.
 * We must make sure that state is 'active'.
 * If it's pending -> retry until it becomes either active or cancelled
 * States: // Active, Cancelled, Completed, Created, Pending, Reactivated, or Suspended
 * @param  {string} agreementId - Agreement Id.
 */
async function fetchUpdatedAgreement(paypal, log, agreementId, attempt = 0) {
  const agreement = await getAgreement(agreementId, paypal);
  log.debug('fetched agreement %j', agreement);
  const state = String(agreement.state).toLowerCase();

  if (state === 'active') {
    return agreement;
  }

  if (state === 'pending') {
    if (attempt > 20) {
      log.warn({ agreement }, 'failed to move agreement to active/failed state');
      return agreement;
    }

    await Promise.delay(250);

    return fetchUpdatedAgreement(paypal, log, agreementId, attempt + 1);
  }

  const error = ExecutionError.agreementStatusForbidden(state);
  log.error({ err: error, agreement }, 'Client tried to execute failed agreement: %j');
  throw ExecutionError.agreementStatusForbidden(state);
}

async function fetchPlan(redis, log, token, agreement) {
  const tokenKey = key('subscription-token', token);

  const data = await redis
    .hgetall(tokenKey)
    .then(deserialize);

  log.info({ data, token: tokenKey }, 'fetched plan for token');

  return {
    owner: data.owner,
    planId: data.planId,
    agreement: {
      ...agreement,
      plan: mergeWithNotNull(data.plan, agreement.plan),
    },
  };
}

async function getCurrentAgreement(amqp, users, owner) {
  const { prefix, postfix, audience } = users;
  const path = `${prefix}.${postfix.getMetadata}`;
  const getRequest = {
    username: owner,
    audience,
  };

  const metadata = await amqp
    .publishAndWait(path, getRequest, { timeout: 5000 })
    .get(audience);

  return {
    oldAgreement: metadata.agreement,
    subscriptionType: metadata.subscriptionType,
    subscriptionInterval: metadata.subscriptionInterval,
  };
}

async function syncTransactions(dispatch, log, agreement, owner, subscriptionInterval, attempt = 0) {
  // we pass owner, so transaction.sync won't try to find user by agreement.id, which is OK as a tradeoff for now
  const { transactions } = await dispatch('transaction.sync', {
    params: {
      id: agreement.id,
      owner,
      start: moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD'),
      end: moment().add(1, 'day').format('YYYY-MM-DD'),
    },
  });

  if (process.env.NODE_ENV === 'test' && transactions.length === 0) {
    if (attempt > 150) {
      const error = ExecutionIncompleteError.fromParams(attempt);
      log.error({ err: error, attempt, agreement }, error.message);
      // ATTENTION! originally we don't throw an error, just log it
      // so we don't send niether failure not success hooks for now
      return agreement;
    }

    await Promise.delay(15000);
    // is it also incomplete?
    log.warn({ attempt, agreement }, 'no transactions fetched for agreement');
    return syncTransactions(dispatch, log, agreement, owner, subscriptionInterval, attempt + 1);
  }

  return agreement;
}

async function checkAndDeleteAgreement(log, dispatch, agreement, owner, oldAgreement, subscriptionType) {
  log.info({ agreement, owner, oldAgreement, subscriptionType }, 'checking agreement data');

  const oldAgreementIsNotFree = oldAgreement !== FREE_PLAN_ID;
  const oldAgreementIsNotNew = oldAgreement !== agreement.id;
  const oldAgreementIsPresent = oldAgreement && oldAgreementIsNotFree && oldAgreementIsNotNew;
  const subscriptionTypeIsPaypal = subscriptionType == null || subscriptionType === 'paypal';

  if (oldAgreementIsPresent && subscriptionTypeIsPaypal) {
    // should we really cancel the agreement?
    log.warn({ oldAgreement, agreement }, 'cancelling old agreement because of new agreement');

    await dispatch('agreement.state', {
      params: {
        owner,
        state: 'cancel',
      },
    }).catch({ statusCode: 400 }, (err) => {
      log.warn({ err }, 'oldAgreement was already cancelled');
    });
  }
}

async function updateRedis(redis, token, agreement, owner, planId) {
  const tokenKey = key('subscription-token', token);
  const agreementKey = key(AGREEMENT_DATA, agreement.id);
  const userAgreementIndex = key(AGREEMENT_INDEX, owner);

  const data = {
    agreement,
    token,
    owner,
    state: agreement.state,
    plan: planId,
  };

  const pipeline = redis.pipeline([
    ['hmset', agreementKey, serialize(data)],
    ['sadd', AGREEMENT_INDEX, agreement.id],
    ['sadd', userAgreementIndex, agreement.id],
    ['del', tokenKey],
  ]);

  handlePipeline(await pipeline.exec());
}

/**
 * @api {amqp} <prefix>.agreement.execute Executes agreement for approval
 * @apiVersion 1.0.0
 * @apiName executeAgreement
 * @apiGroup Agreement
 *
 * @apiDescription Performs agreement approval through paypal and sends link back
  *
 * @apiSchema {jsonschema=agreement/execute.json} apiRequest
 * @apiSchema {jsonschema=response/agreement/execute.json} apiResponse
 */
async function agreementExecute({ params }) {
  const { config, redis, amqp, dispatch } = this;
  const { token } = params;

  let agreementData;
  try {
    agreementData = await findAgreementData(redis, amqp, token);
  } catch (e) {
    if (e instanceof ExecutionError) {
      await publishFailureHook(amqp, e);
      throw new HttpStatusError(404, 'Subscription token not found');
    }
    throw e;
  }

  this.log = this.log.child({ agreementData });

  let agreementId;
  try {
    agreementId = await sendRequest(token, config.paypal);
  } catch (e) {
    if (e instanceof ExecutionError) {
      await publishFailureHook(amqp, e);
      this.log.error({ err: e }, e.message);
      throw new HttpStatusError(400, e.message);
    }
    this.log.error({ err: e }, e.message);
    throw new HttpStatusError(400, 'Unexpected paypal request error');
  }

  let updatedAgreement;
  try {
    updatedAgreement = await fetchUpdatedAgreement(config.paypal, this.log, agreementId);
  } catch (e) {
    if (e instanceof ExecutionError) {
      await publishFailureHook(amqp, e);
      throw new HttpStatusError(412, e.message);
    }
    this.log.error({ err: e }, 'Unexpected paypal request error');
    throw e;
  }

  const { owner, planId, agreement } = await fetchPlan(redis, this.log, token, updatedAgreement);
  const { oldAgreement, subscriptionInterval, subscriptionType } = await getCurrentAgreement(amqp, config.users, owner);
  await checkAndDeleteAgreement(this.log, dispatch, agreement, owner, oldAgreement, subscriptionType);

  const agreementPayload = planId === FREE_PLAN_ID
    ? freeAgreementPayload(owner)
    : paidAgreementPayload(agreement, agreement.state, owner);

  await publishSuccessHook(amqp, { agreement: agreementPayload });

  await updateRedis(redis, token, agreement, owner, planId);

  const agreementWithSyncedTransactions = await syncTransactions(dispatch, this.log, agreement, owner, subscriptionInterval);

  return agreementWithSyncedTransactions;
}

agreementExecute.transports = [ActionTransport.amqp];

module.exports = agreementExecute;
