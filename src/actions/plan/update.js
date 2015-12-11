const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');

function planUpdate(message) {
  const { _config, redis } = this;
  const { id, plan } = message;

  const promise = Promise.bind(this);

  function buildQuery(values) {
    return [{
      'op': 'replace',
      'path': '/',
      'value': ld.omit(values, 'hidden'),
    }];
  }

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingPlan.update(id, buildQuery(plan), _config.paypal, (error) => {
        if (error) {
          return reject(error);
        }

        return resolve(true);
      });
    });
  }

  function updateRedis() {
    const planKey = key('plans-data', id);
    const pipeline = redis.pipeline();

    if (message.alias !== null && message.alias !== undefined) {
      pipeline.hsetnx(planKey, 'alias', message.alias);
    }
    pipeline.hsetnx(planKey, 'plan', JSON.stringify(plan));
    pipeline.hsetnx(planKey, 'type', plan.type);
    pipeline.hsetnx(planKey, 'state', plan.state);
    pipeline.hsetnx(planKey, 'name', plan.name);
    pipeline.hsetnx(planKey, 'hidden', plan.hidden);

    pipeline.sadd('plans-index', plan.id);

    return pipeline.exec().then(() => {
      return plan;
    });
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planUpdate;
