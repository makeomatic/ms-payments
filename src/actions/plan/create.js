const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const merge = require('lodash/object/merge');
const assign = require('lodash/object/assign');
const cloneDeep = require('lodash/lang/cloneDeep');
const reduce = require('lodash/collection/reduce');
const findWhere = require('lodash/collection/findWhere');
const mapValues = require('lodash/object/mapValues');
const compact = require('lodash/array/compact');
const isArray = Array.isArray;
const billingPlanCreate = Promise.promisify(paypal.billingPlan.create, { context: paypal.billingPlan });
const Errors = require('common-errors');

function merger(a, b, k) {
  if (k === 'id') {
    return compact([a, b]).join('|');
  }

  if (isArray(a) && isArray(b)) {
    return a.concat(b);
  }
}

function createJoinPlans(message) {
  return function joinPlans(plans) {
    return {
      plan: merge({}, ...plans, { name: message.plan.name }, merger),
      plans,
    };
  };
}

function sendRequest(config, message) {
  const defaultMerchantPreferences = {
    return_url: config.urls.plan_return,
    cancel_url: config.urls.plan_cancel,
  };

  // setup default merchant preferences
  message.plan.merchant_preferences = merge(defaultMerchantPreferences, message.plan.merchant_preferences || {});

  // divide single plan definition into as many as payment_definitions present
  const plans = message.plan.payment_definitions.map(definition => {
    const plan = assign(cloneDeep(message.plan), {
      name: message.plan.name + ' - ' + definition.frequency,
      payment_definitions: [definition],
    });

    return billingPlanCreate(plan, config.paypal);
  });

  return Promise.all(plans);
}

function createSaveToRedis(redis, message) {
  return function saveToRedis(data) {
    const { plan, plans } = data;
    const aliasedId = message.alias || plan.id;
    const hidden = message.hidden || false;

    const pipeline = redis.pipeline();
    const planKey = key('plans-data', aliasedId);
    const plansData = reduce(plans, (a, p) => {
      const frequency = p.payment_definitions[0].frequency;
      a[frequency.toLowerCase()] = p.id;
      return a;
    }, { full: aliasedId });

    pipeline.sadd('plans-index', aliasedId);

    const subscriptions = message.subscriptions.map(subscription => {
      subscription.definition = findWhere(plan.payment_definitions, { name: subscription.name });
      return subscription;
    });

    const saveDataFull = {
      plan: {
        ...plan,
        hidden: hidden,
      },
      subs: subscriptions,
      type: plan.type,
      state: plan.state,
      name: plan.name,
      hidden: hidden,
      ...plansData,
    };

    if (message.alias !== null && message.alias !== undefined) {
      saveDataFull.alias = message.alias;
    }

    pipeline.hmset(planKey, mapValues(saveDataFull, JSON.stringify, JSON));

    plans.forEach(p => {
      const saveData = {
        plan: {
          ...p,
          hidden: hidden,
        },
        subs: [findWhere(subscriptions, { name: p.payment_definitions[0].name })],
        type: p.type,
        state: p.state,
        name: p.name,
        hidden,
      };

      if (message.alias) {
        saveData.alias = message.alias;
      }

      pipeline.hmset(key('plans-data', p.id), mapValues(saveData, JSON.stringify, JSON));
    });

    return pipeline.exec().return(plan);
  };
}

/**
 * Creates paypal plan with a special case for a free plan
 * @param  {Object} message
 * @return {Promise}
 */
module.exports = function planCreate(message) {
  const { config, redis } = this;
  const { alias } = message;
  const saveToRedis = createSaveToRedis(redis, message);
  let promise = Promise.bind(this);

  if (alias) {
    promise = redis.sismember('plans-index', alias).then(isMember => {
      if (isMember === 1) {
        throw new Errors.HttpStatusError(409, `plan ${alias} already exists`);
      }
    });
  }

  // this is a free plan, don't put it on paypal
  if (alias === 'free') {
    message.plan.id = alias;
    promise = promise.return({ plan: message.plan, plans: [] });
  } else {
    promise = promise.return([config, message]).spread(sendRequest).then(createJoinPlans(message));
  }

  return promise.then(saveToRedis);
};
