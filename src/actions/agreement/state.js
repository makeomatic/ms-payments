const Promise = require('bluebird');
const Errors = require('common-errors');
const moment = require('moment');
const { ActionTransport } = require('@microfleet/core');
const get = require('get-value');

// helpers
const key = require('../../redis-key');
const { agreement: operations } = require('../../utils/paypal');
const { serialize } = require('../../utils/redis');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');
const { hmget } = require('../../list-utils');

const AGREEMENT_KEYS = ['agreement', 'owner'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);

// correctly save state
const ACTION_TO_STATE = {
  suspend: 'suspended',
  reactivate: 'active',
  cancel: 'cancelled',
};

const isErrorToBeIgnored = (err) => {
  return err.httpStatusCode === 400
      && err.response
      && err.response.name === 'STATUS_INVALID'
      && err.response.message === 'Invalid profile status for cancel action; profile should be active or suspended';
};

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

const successEvent = 'paypal:agreements:state:success';
const publishSuccessHook = (amqp, payload) => publishHook(amqp, successEvent, payload);
const successPayload = (agreement, status, owner) => ({
  agreement: {
    owner,
    status,
    id: agreement.id,
  },
});

/**
 * @api {amqp} <prefix>.agreement.state Change agreement state
 * @apiVersion 1.0.0
 * @apiName agreementState
 * @apiGroup Agreement
 *
 * @apiDescription Change currently used agreement for {owner} to {state}
 *
 * @apiSchema {jsonschema=agreement/state.json} apiRequest
 * @apiSchema {jsonschema=response/agreement/state.json} apiResponse
 */
async function agreementState({ params: message }) {
  const { config, redis, amqp, log } = this;
  const { agreement: agreementId, state: action } = message;
  const note = message.note || `Applying '${action}' operation to agreement`;

  if (agreementId === FREE_PLAN_ID) {
    throw new Errors.NotPermittedError('Can not change state of a free agreement');
  }

  const agreementKey = key(AGREEMENT_DATA, agreementId);
  const data = await redis.hmget(agreementKey, AGREEMENT_KEYS);
  const parsed = agreementParser(data);
  const { agreement, owner } = parsed;
  const subscriptionInterval = get(agreement, ['plan', 'payment_definitions', '0', 'frequency']).toLowerCase();
  const subscriptionType = get(agreement, ['payer', 'payment_method']);

  if (subscriptionType === 'capp') {
    throw new Errors.NotPermittedError('Must use capp payments service');
  }

  try {
    log.info({ action, agreementId, note }, 'updating agreement state');
    await operations[action].call(this, agreementId, { note }, config.paypal);
  } catch (err) {
    if (!isErrorToBeIgnored(err)) {
      log.error({ err, action, agreementId, note }, 'failed to update agreement state');
      throw new Errors.HttpStatusError(err.httpStatusCode, `[${action}] ${agreementId}: ${err.response.message}`, err.response.name);
    } else {
      log.warn({ err, action, agreementId, note }, 'failed to update agreement state, but can be ignored');
    }
  }

  const state = ACTION_TO_STATE[action];

  await Promise.all([
    this.dispatch('transaction.sync', {
      params: {
        id: agreementId,
        owner,
        start: moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD'),
        end: moment().add(1, 'day').format('YYYY-MM-DD'),
      },
    }),
    redis.hmset(agreementKey, serialize({ state })),
  ]);

  await publishSuccessHook(amqp, successPayload(agreement, state, owner));

  return state;
}

agreementState.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = agreementState;
