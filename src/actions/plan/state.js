const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');
const update = Promise.promisify(paypal.billingPlan.update, { context: paypal.billingPlan });

function planState(message) {
  const { _config, redis, log } = this;
  const { id, state } = message;

  const promise = Promise.bind(this);

  function sendRequest() {
    const request = [{
      'op': 'replace',
      'path': '/',
      'value': { state },
    }];

    const ids = id.split('|');
    if (ids.length === 1) {
      return update(ids[0], request, _config.paypal);
    }

    const requests = ld.map(ids, (planId) => {
      return update(planId, request, _config.paypal);
    });

    return Promise.all(requests);
  }

  function updateRedis() {
    const ids = id.split('|').concat([id]);
    const keys = ld.map(ids, (planId) => { return key('plans-data', planId); });
    const pipeline = redis.pipeline();

    ld.forEach(keys, planId => {
      pipeline.hset(planId, 'state', JSON.stringify(state));
    });

    log.debug('updating state for ids %s to %s', ids.join(', '), state);

    return pipeline.exec();
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planState;
