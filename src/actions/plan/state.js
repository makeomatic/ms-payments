const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const uniq = require('lodash/uniq');
const compact = require('lodash/compact');

// helpers
const key = require('../../redis-key');
const { PLANS_DATA, PLAN_ALIAS_FIELD } = require('../../constants');
const { serialize, handlePipeline } = require('../../utils/redis');
const { plan: { update } } = require('../../utils/paypal');

function isAlreadyInState(err) {
  return err.httpStatusCode === 400
    && err.response
    && err.response.name === 'BUSINESS_VALIDATION_ERROR'
    && err.response.details
    && err.response.details.find((el) => (
      el.issue === 'Plan already in same state.'
    ));
}

/**
 * @api {amqp, internal} <prefix>.plan.state Change plan state
 * @apiVersion 1.0.0
 * @apiName planState
 * @apiGroup Plan
 *
 * @apiDescription Changes plan state
 *
 * @apiSchema {jsonschema=plan/state.json} apiRequest
 * @apiSchema {jsonschema=response/plan/state.json} apiResponse
 */
async function planState({ log, params: message }) {
  const { config, redis } = this;
  const { id, state } = message;
  const { paypal: paypalConfig } = config;

  const possibleAlias = await redis.hget(key(PLANS_DATA, id), PLAN_ALIAS_FIELD);
  const alias = possibleAlias && possibleAlias.length > 0 && JSON.parse(possibleAlias);
  const request = [{
    op: 'replace',
    path: '/',
    value: { state },
  }];

  const partialIds = id.split('|');
  const requests = [];
  for (const planId of partialIds) {
    requests.push(
      update(planId, request, paypalConfig).catchReturn(isAlreadyInState, 'OK')
    );
  }

  await Promise.all(requests);

  const ids = compact(uniq(partialIds.concat([id, alias])));
  const serializedState = serialize({ state });

  const pipeline = redis.pipeline(ids.map((planId) => [
    'hmset', key(PLANS_DATA, planId), serializedState,
  ]));

  log.debug({ state, ids }, 'updating state for ids %s to %s', ids.join(', '), state);

  return handlePipeline(await pipeline.exec());
}

planState.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = planState;
