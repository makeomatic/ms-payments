const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const merge = require('lodash/merge');
const assign = require('lodash/assign');
const cloneDeep = require('lodash/cloneDeep');
const reduce = require('lodash/reduce');
const find = require('lodash/find');
const mapValues = require('lodash/mapValues');
const compact = require('lodash/compact');
const isArray = Array.isArray;
const JSONStringify = JSON.stringify.bind(JSON);
const billingPlanCreate = Promise.promisify(paypal.billingPlan.create, { context: paypal.billingPlan }); // eslint-disable-line
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
    auto_bill_amount: 'YES',
    initial_fail_amount_action: 'CANCEL',
  };

  // setup default merchant preferences
  const { plan } = message;
  const { merchant_preferences: merchatPref } = plan;
  plan.merchant_preferences = merge(defaultMerchantPreferences, merchatPref || {});

  // divide single plan definition into as many as payment_definitions present
  const plans = plan.payment_definitions.map(definition => {
    const partialPlan = assign(cloneDeep(message.plan), {
      name: message.plan.name + ' - ' + definition.frequency.toLowerCase(),
      payment_definitions: [definition],
    });

    return billingPlanCreate(partialPlan, config.paypal);
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
      subscription.definition = find(plan.payment_definitions, item => {
        return item.frequency.toLowerCase() === subscription.name;
      });
      return subscription;
    });

    const saveDataFull = {
      plan: {
        ...plan,
        hidden,
      },
      subs: subscriptions,
      type: plan.type,
      state: plan.state,
      name: plan.name,
      hidden,
      ...plansData,
    };

    if (message.alias !== null && message.alias !== undefined) {
      saveDataFull.alias = message.alias;
    }

    pipeline.hmset(planKey, mapValues(saveDataFull, JSONStringify));

    plans.forEach(p => {
      const saveData = {
        plan: {
          ...p,
          hidden,
        },
        subs: [find(subscriptions, ['name', p.payment_definitions[0].frequency.toLowerCase()])],
        type: p.type,
        state: p.state,
        name: p.name,
        hidden,
      };

      if (message.alias) {
        saveData.alias = message.alias;
      }

      pipeline.hmset(key('plans-data', p.id), mapValues(saveData, JSONStringify));
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

  if (alias && alias !== 'free') {
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
