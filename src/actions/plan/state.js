const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const update = Promise.promisify(paypal.billingPlan.update, { context: paypal.billingPlan });
const map = require('lodash/map');
const forEach = require('lodash/forEach');
const { PLANS_DATA } = require('../../constants.js');
const serialize = require('../../utils/redis.js');

function planState(message) {
  const { _config, redis, log } = this;
  const { id, state } = message;
  const { paypal: paypalConfig } = _config;
  const promise = Promise.bind(this);

  function sendRequest() {
    const request = [{
      op: 'replace',
      path: '/',
      value: { state },
    }];

    const ids = id.split('|');
    if (ids.length === 1) {
      return update(ids[0], request, paypalConfig);
    }

    const requests = map(ids, planId => update(planId, request, paypalConfig));

    return Promise.all(requests);
  }

  function updateRedis() {
    const ids = id.split('|').concat([id]);
    const keys = map(ids, planId => key(PLANS_DATA, planId));
    const pipeline = redis.pipeline();

    forEach(keys, planId => {
      pipeline.hmset(planId, serialize({ state }));
    });

    log.debug('updating state for ids %s to %s', ids.join(', '), state);

    return pipeline.exec();
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planState;
