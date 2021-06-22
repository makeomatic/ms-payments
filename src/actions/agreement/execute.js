const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');

const { AGREEMENT_INDEX, AGREEMENT_DATA } = require('../../constants');

// helpers
const key = require('../../redis-key');

const { serialize, deserialize, handlePipeline } = require('../../utils/redis');
const { mergeWithNotNull } = require('../../utils/plans');
const { ExecutionError } = require('../../utils/paypal/agreements').error;
const { fetchUpdatedAgreement } = require('../../utils/paypal/agreements/update');
const { RequestError } = require('../../utils/paypal/client').error;
const {
  publishExecutionFailureHook, publishExecutionSuccessHook, successExecutionPayload,
} = require('../../utils/paypal/billing-hooks');

// internal actions
const { agreement: { execute } } = require('../../utils/paypal');

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
async function sendExecuteRequest(token, owner, paypal) {
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

async function saveAgreement(redis, token, agreement, owner, planId, taskId, finalizedAt) {
  const tokenKey = key('subscription-token', token);
  const agreementKey = key(AGREEMENT_DATA, agreement.id);
  const userAgreementIndex = key(AGREEMENT_INDEX, owner);

  const data = {
    agreement,
    token,
    owner,
    state: agreement.state,
    plan: planId,
    taskId,
    finalizedAt,
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
      await publishExecutionFailureHook(amqp, e);
      throw new HttpStatusError(404, 'Subscription token not found');
    }
    throw e;
  }

  const log = this.log.child({ agreementData });
  const { owner, planId, taskId } = agreementData;

  let agreementId;
  try {
    agreementId = await sendExecuteRequest(token, owner, config.paypal);
  } catch (e) {
    if (e instanceof ExecutionError) {
      await publishExecutionFailureHook(amqp, e);
      log.error({ err: e }, e.message);
      throw new HttpStatusError(400, e.message);
    }
    log.error({ err: e }, e.message);
    throw new HttpStatusError(400, 'Unexpected paypal request error');
  }

  let updatedAgreement;
  try {
    updatedAgreement = await fetchUpdatedAgreement(config.paypal, log, agreementId, owner, token);
  } catch (e) {
    if (e instanceof ExecutionError) {
      await publishExecutionFailureHook(amqp, e);
      throw new HttpStatusError(412, e.message);
    }
    this.log.error({ err: e }, 'Unexpected paypal request error');
    throw e;
  }

  // Paypal provides limited plan info and we should merge it with extra data
  const agreement = { ...updatedAgreement, plan: mergeWithNotNull(agreementData.plan, updatedAgreement.plan) };
  await saveAgreement(redis, token, agreement, owner, planId, taskId);

  // Notify hook but without transaction
  const payload = successExecutionPayload(agreement, token, owner, taskId);
  await publishExecutionSuccessHook(amqp, payload);

  return agreement;
}

agreementExecute.transports = [ActionTransport.amqp];

module.exports = agreementExecute;
