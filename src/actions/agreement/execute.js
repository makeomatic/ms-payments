const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');

// helpers
const key = require('../../redis-key');
const { AGREEMENT_INDEX, AGREEMENT_DATA } = require('../../constants');
const { serialize, deserialize, handlePipeline } = require('../../utils/redis');
const { mergeWithNotNull } = require('../../utils/plans');
const { ExecutionError } = require('../../utils/paypal/agreements').error;
const { RequestError } = require('../../utils/paypal/client').error;
const { publishFailureHook } = require('../../utils/paypal/billing-hooks');

// internal actions
const { agreement: { execute, get: getAgreement } } = require('../../utils/paypal');

/**
 * @throws ExecutionError Unknown subscription token
 */
async function findAgreementData(redis, token) {
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
async function sendRequest(token, owner, paypal) {
  let result;
  try {
    result = await execute(token, {}, paypal);
  } catch (error) {
    const wrapper = RequestError.wrapOrigin(error);
    if (wrapper.isTokenInvalidError()) {
      throw ExecutionError.invalidSubscriptionToken(token, owner);
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
async function fetchUpdatedAgreement(paypal, log, agreementId, owner, token, attempt = 0) {
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

    return fetchUpdatedAgreement(paypal, log, agreementId, owner, token, attempt + 1);
  }

  const error = ExecutionError.agreementStatusForbidden(agreementId, token, state, owner);
  log.error({ err: error, agreement }, 'Client tried to execute failed agreement: %j');
  throw error;
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
  const { config, redis, amqp } = this;
  const { token } = params;

  let agreementData;
  try {
    agreementData = await findAgreementData(redis, token);
  } catch (e) {
    if (e instanceof ExecutionError) {
      await publishFailureHook(amqp, e);
      throw new HttpStatusError(404, 'Subscription token not found');
    }
    throw e;
  }

  this.log = this.log.child({ agreementData });
  const { owner, planId } = agreementData;
  let agreementId;
  try {
    agreementId = await sendRequest(token, owner, config.paypal);
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
    updatedAgreement = await fetchUpdatedAgreement(config.paypal, this.log, agreementId, owner, token);
  } catch (e) {
    if (e instanceof ExecutionError) {
      await publishFailureHook(amqp, e);
      throw new HttpStatusError(412, e.message);
    }
    this.log.error({ err: e }, 'Unexpected paypal request error');
    throw e;
  }

  // Paypal provides limited plan info and we should merge it with extra data
  const agreement = { ...updatedAgreement, plan: mergeWithNotNull(agreementData.plan, updatedAgreement.plan) };

  await updateRedis(redis, token, agreement, owner, planId);
  const { prefix } = this.config.router.routes;

  await this.amqp.publish(
    `${prefix}.agreement.finalize-execution`,
    { agreementId: agreement.id, owner },
    {
      confirm: true,
      mandatory: true,
      deliveryMode: 2,
      priority: 0,
    }
  );

  return agreement;
}

agreementExecute.transports = [ActionTransport.amqp];

module.exports = agreementExecute;
