const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const map = require('lodash/map');
const forEach = require('lodash/forEach');
const uniq = require('lodash/uniq');
const compact = require('lodash/compact');

// helpers
const key = require('../../redisKey');
const { PLANS_DATA, PLAN_ALIAS_FIELD } = require('../../constants');
const { serialize } = require('../../utils/redis');
const { plan: { update } } = require('../../utils/paypal');

function planState({ params: message }) {
  const { config, redis, log } = this;
  const { id, state } = message;
  const { paypal: paypalConfig } = config;

  function getPlan() {
    return redis
      .hget(key(PLANS_DATA, id), PLAN_ALIAS_FIELD)
      .then(alias => alias && alias.length > 0 && JSON.parse(alias));
  }

  function sendRequest() {
    const request = [{
      op: 'replace',
      path: '/',
      value: { state },
    }];

    const ids = id.split('|');
    const requests = map(ids, planId => update(planId, request, paypalConfig));
    return Promise.all(requests);
  }

  function updateRedis(alias) {
    const ids = compact(uniq(id.split('|').concat([id, alias])));
    const keys = map(ids, planId => key(PLANS_DATA, planId));
    const pipeline = redis.pipeline();

    forEach(keys, (planId) => {
      pipeline.hmset(planId, serialize({ state }));
    });

    log.debug('updating state for ids %s to %s', ids.join(', '), state);

    return pipeline.exec();
  }

  return Promise
    .bind(this)
    .then(getPlan)
    .tap(sendRequest)
    .then(updateRedis);
}

planState.transports = [ActionTransport.amqp];

module.exports = planState;
