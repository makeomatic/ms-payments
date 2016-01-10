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
      'value': ld.omit(values, ['hidden', 'id']),
    }];
  }

  function sendRequest() {
    const request = buildQuery(plan);
    const update = Promise.promisify(paypal.billingPlan.update, { context: paypal.billingPlan });
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
    const planKey = key('plans-data', id);
    const pipeline = redis.pipeline();

    const data = {
      plan: { ...plan, id },
      type: plan.type,
      state: plan.state,
      name: plan.name,
      hidden: plan.hidden,
    };

    if (message.alias !== null && message.alias !== undefined) {
      data.alias = message.alias;
    }

    pipeline.hmset(planKey, ld.mapValues(data, JSON.stringify, JSON));
    pipeline.sadd('plans-index', id);

    return pipeline.exec().return(plan);
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planUpdate;
