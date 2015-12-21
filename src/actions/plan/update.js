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

    const data = {
      plan,
      type: plan.type,
      state: plan.state,
      name: plan.name,
      hidden: plan.hidden,
    };

    if (message.alias !== null && message.alias !== undefined) {
      data.alias = message.alias;
    }

    pipeline.hmset(planKey, ld.mapValues(data, JSON.stringify, JSON));
    pipeline.sadd('plans-index', plan.id);

    return pipeline.exec().then(() => {
      return plan;
    });
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planUpdate;
