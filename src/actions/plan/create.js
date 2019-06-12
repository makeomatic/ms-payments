const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const Errors = require('common-errors');
const merge = require('lodash/merge');
const cloneDeep = require('lodash/cloneDeep');
const reduce = require('lodash/reduce');
const find = require('lodash/find');

// internal actions
const statePlan = require('./state');

// helpers
const key = require('../../redis-key');
const { cleanupCache } = require('../../list-utils');
const { PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID } = require('../../constants');
const {
  plan: { create: billingPlanCreate }, handleError, is, states: { active },
} = require('../../utils/paypal');
const { serialize } = require('../../utils/redis');
const { createJoinPlans } = require('../../utils/plans');

function sendRequest(config, message) {
  const defaultMerchantPreferences = {
    return_url: config.urls.plan_return,
    cancel_url: config.urls.plan_cancel,
    auto_bill_amount: 'YES',
    initial_fail_amount_action: 'CANCEL',
  };

  // setup default merchant preferences
  const { plan } = message;
  const { merchant_preferences: merchatPref, payment_definitions: paymentDefinitions } = plan;
  plan.merchant_preferences = merge(defaultMerchantPreferences, merchatPref || {});

  // divide single plan definition into as many as payment_definitions present
  const plans = Promise.map(paymentDefinitions, (definition) => {
    const partialPlan = {
      ...cloneDeep(plan),
      name: `${plan.name}-${definition.frequency.toLowerCase()}`,
      payment_definitions: [definition],
    };

    return billingPlanCreate(partialPlan, config.paypal).catch(handleError);
  });

  if (is.active(message.plan) === false) {
    return plans;
  }

  // activate the plan if we requested it
  return plans.map((planData) => {
    const { id } = planData;
    planData.state = active;
    return statePlan
      .call(this, { params: { id, state: active } })
      .return(planData);
  });
}

function createSaveToRedis(redis, message) {
  return function saveToRedis(data) {
    const { plan, plans } = data;
    const { meta, level } = message;
    const aliasedId = message.alias || plan.id;
    const hidden = message.hidden || false;

    const pipeline = redis.pipeline();
    const planKey = key(PLANS_DATA, aliasedId);
    const plansData = reduce(plans, (a, p) => {
      const { frequency } = p.payment_definitions[0];
      a[frequency.toLowerCase()] = p.id;
      return a;
    }, {});

    pipeline.sadd(PLANS_INDEX, aliasedId);

    const subscriptions = message.subscriptions.map((subscription) => {
      subscription.definition = find(plan.payment_definitions, item => (
        item.frequency.toLowerCase() === subscription.name
      ));
      return subscription;
    });

    const saveDataFull = {
      plan: {
        ...plan,
        hidden,
      },
      id: plan.id,
      subs: subscriptions,
      type: plan.type,
      state: plan.state,
      name: plan.name,
      hidden,
      ...plansData,
      meta,
      level,
    };

    if (message.alias !== null && message.alias !== undefined) {
      saveDataFull.alias = message.alias;
    }

    const serializedData = serialize(saveDataFull);
    pipeline.hmset(planKey, serializedData);

    if (plan.id !== aliasedId) {
      pipeline.hmset(key(PLANS_DATA, plan.id), serializedData);
    }

    plans.forEach((planData) => {
      const saveData = {
        plan: {
          ...planData,
          hidden,
        },
        id: planData.id,
        subs: [find(subscriptions, { name: planData.payment_definitions[0].frequency.toLowerCase() })],
        type: planData.type,
        state: planData.state,
        name: planData.name,
        hidden,
        meta,
        level,
      };

      if (message.alias) {
        saveData.alias = message.alias;
      }

      pipeline.hmset(key(PLANS_DATA, planData.id), serialize(saveData));
    });

    return pipeline.exec().return(saveDataFull);
  };
}

/**
 * Creates paypal plan with a special case for a free plan
 * @param  {Object} message
 * @return {Promise}
 */
function planCreate({ params: message }) {
  const { config, redis } = this;
  const { alias } = message;
  const saveToRedis = createSaveToRedis(redis, message);
  let promise = Promise.bind(this);

  if (alias && alias !== FREE_PLAN_ID) {
    promise = promise.then(() => {
      return redis.sismember(PLANS_INDEX, alias).then((isMember) => {
        if (isMember === 1) {
          throw new Errors.HttpStatusError(409, `plan ${alias} already exists`);
        }

        return null;
      });
    });
  }

  // this is a free plan, don't put it on paypal
  if (alias === FREE_PLAN_ID) {
    message.plan.id = alias;
    promise = promise.return({ plan: message.plan, plans: [] });
  } else {
    promise = promise.return([config, message]).spread(sendRequest).then(createJoinPlans(message));
  }

  return promise
    .then(saveToRedis)
    .tap(() => cleanupCache.call(this, PLANS_INDEX));
}

planCreate.transports = [ActionTransport.amqp];

module.exports = planCreate;
