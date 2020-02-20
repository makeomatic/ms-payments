const Promise = require('bluebird');
const Errors = require('common-errors');
const moment = require('moment');
const { ActionTransport } = require('@microfleet/core');

// helpers
const key = require('../../redis-key');
const { agreement: operations } = require('../../utils/paypal');
const resetToFreePlan = require('../../utils/reset-to-free-plan');
const { serialize } = require('../../utils/redis');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');

// correctly save state
const ACTION_TO_STATE = {
  suspend: 'suspended',
  reactivate: 'active',
  cancel: 'cancelled',
};

/**
 * @api {amqp} <prefix>.agreement.state Changes agreement state
 * @apiVersion 1.0.0
 * @apiName agreementState
 * @apiGroup Agreement
 *
 * @apiDescription Change currently used agreement for {owner} to {state}
 *
 * @apiParam (Params) {Object} params - request container
 * @apiParam (Params) {String} params.owner - user to change agreement state for
 * @apiParam (Params) {String="suspend","reactivate","cancel"} params.state - new state
 */
async function agreementState({ params: message }) {
  const { config, redis, amqp, log } = this;
  const { users: { prefix, postfix, audience, timeouts } } = config;
  const { owner, state } = message;
  const note = message.note || `Applying '${state}' operation to agreement`;
  const usersMetadataRoute = `${prefix}.${postfix.getMetadata}`;
  const getIdRequest = { username: owner, audience };

  const meta = await amqp
    .publishAndWait(usersMetadataRoute, getIdRequest, { timeout: timeouts.getMetadata })
    .get(audience);

  const { agreement: id, subscriptionInterval, subscriptionType } = meta;
  const agreementKey = key(AGREEMENT_DATA, id);

  if (id === FREE_PLAN_ID) {
    throw new Errors.NotPermittedError('User has free plan/agreement');
  }

  if (subscriptionType === 'capp') {
    throw new Errors.NotPermittedError('Must use capp payments service');
  }

  try {
    log.info({ state, agreementId: id, note }, 'updating agreement state');
    await operations[state].call(this, id, { note }, config.paypal);
  } catch (err) {
    if (err.httpStatusCode !== 400) {
      throw new Errors.HttpStatusError(err.httpStatusCode, `[${state}] ${id}: ${err.response.message}`, err.response.name);
    }
  }

  await this.dispatch('transaction.sync', {
    params: {
      id,
      owner,
      start: moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD'),
      end: moment().add(1, 'day').format('YYYY-MM-DD'),
    },
  });

  const promises = [
    redis.hmset(agreementKey, serialize({ state: ACTION_TO_STATE[state] })),
  ];

  if (state === 'cancel') {
    promises.push(resetToFreePlan.call(this, owner));
  }

  await Promise.all(promises);
  return state;
}

agreementState.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = agreementState;
