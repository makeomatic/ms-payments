const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const paypalPlanUpdate = Promise.promisify(paypal.billingPlan.update, { context: paypal.billingPlan }); // eslint-disable-line

const omit = require('lodash/omit');
const map = require('lodash/map');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const { PLANS_DATA, PLANS_INDEX } = require('../../constants.js');

function planUpdate(message) {
  const { _config, redis } = this;
  const { id, plan } = message;
  const { paypal: paypalConfig } = _config;

  function buildQuery(values) {
    return [{
      op: 'replace',
      path: '/',
      value: omit(values, ['hidden', 'id']),
    }];
  }

  function sendRequest() {
    const request = buildQuery(plan);

    const ids = id.split('|');

    if (ids.length === 1) {
      return paypalPlanUpdate(ids[0], request, paypalConfig);
    }

    const requests = map(ids, planId => paypalPlanUpdate(planId, request, paypalConfig));

    return Promise.all(requests);
  }

  function updateRedis() {
    const planKey = key(PLANS_DATA, id);
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

    pipeline.hmset(planKey, mapValues(data, JSONStringify));
    pipeline.sadd(PLANS_INDEX, id);

    return pipeline.exec().return(plan);
  }

  return Promise
    .bind(this)
    .then(sendRequest)
    .then(updateRedis);
}

module.exports = planUpdate;
