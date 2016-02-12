const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const update = Promise.promisify(paypal.billingPlan.update, { context: paypal.billingPlan });
const map = require('lodash/map');
const forEach = require('lodash/forEach');
const uniq = require('lodash/uniq');
const compact = require('lodash/compact');
const { PLANS_DATA } = require('../../constants.js');
const { serialize } = require('../../utils/redis.js');

function planState(message) {
  const { _config, redis, log } = this;
  const { id, state } = message;
  const { paypal: paypalConfig } = _config;

  function getPlan() {
    return redis
      .hgetBuffer(key(PLANS_DATA, id), 'alias')
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

    forEach(keys, planId => {
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

module.exports = planState;
