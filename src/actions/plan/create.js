const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');

function planCreate(message) {
  const {
    _config,
    redis,
  } = this;

  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingPlan.create(message.plan, _config.paypal, (error, newPlan) => {
        if (error) {
          reject(error);
        } else {
          resolve(newPlan);
        }
      });
    });
  }

  function checkAlias() {

  }

  function saveToRedis(plan) {
    const planKey = key('plans-data', plan.id);
    const pipeline = redis.pipeline;

    if (message.alias !== null && message.alias !== undefined) {
      pipeline.hsetnx(planKey, 'alias', message.alias);
    }
    pipeline.hsetnx(planKey, 'plan', JSON.stringify(plan));
    pipeline.hsetnx(planKey, 'type', plan.type);
    pipeline.hsetnx(planKey, 'state', plan.state);
    pipeline.hsetnx(planKey, 'name', plan.name);
    pipeline.hsetnx(planKey, 'hidden', message.hidden);

    pipeline.sadd('plans-index', plan.id);

    plan.hidden = message.hidden;

    return pipeline.exec().then(() => {
      return plan;
    });
  }

  return promise.then(checkAlias).then(sendRequest).then(saveToRedis);
}

module.exports = planCreate;
