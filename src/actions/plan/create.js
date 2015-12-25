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
      subscription.definition = ld.findWhere(plan.payment_definitions, { name: subscription.name });
      return subscription;
    });

    const data = {
      plan: {
        ...plan,
        hidden: message.hidden,
      },
      subs: subscriptions,
      type: plan.type,
      state: plan.state,
      name: plan.name,
      hidden: message.hidden,
    };

    if (message.alias !== null && message.alias !== undefined) {
      data.alias = message.alias;
    }

    pipeline.hmset(planKey, ld.mapValues(data, JSON.stringify, JSON));
    pipeline.sadd('plans-index', plan.id);

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
