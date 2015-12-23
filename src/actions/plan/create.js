const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');

function planCreate(message) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingPlan.create(message.plan, _config.paypal, (error, newPlan) => {
        if (error) {
          return reject(error);
        }

        resolve(newPlan);
      });
    });
  }

  function saveToRedis(plan) {
    const planKey = key('plans-data', plan.id);
    const pipeline = redis.pipeline();

    const subscriptions = ld.map(message.subscriptions, (subscription) => {
      subscription.id = ld.findWhere(plan.payment_definitions, { name: subscription.name });
      return subscription;
    });

    if (message.alias !== null && message.alias !== undefined) {
      pipeline.hset(planKey, 'alias', message.alias);
    }
    pipeline.hset(planKey, 'plan', JSON.stringify(plan));
    pipeline.hset(planKey, 'subs', JSON.stringify(subscriptions));
    pipeline.hset(planKey, 'type', plan.type);
    pipeline.hset(planKey, 'state', plan.state);
    pipeline.hset(planKey, 'name', plan.name);
    pipeline.hset(planKey, 'hidden', message.hidden);

    pipeline.sadd('plans-index', plan.id);

    plan.hidden = message.hidden;
    return pipeline.exec().return(plan);
  }

  if (message.alias === 'free') {
    // this is a free plan, don't put it on paypal
    message.plan.id = 'free';
    return promise.return(message.plan).then(saveToRedis);
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = planCreate;
