const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const paypalPlanUpdate = Promise.promisify(paypal.billingPlan.update, { context: paypal.billingPlan }); // eslint-disable-line

const omit = require('lodash/omit');
const map = require('lodash/map');
const merge = require('lodash/merge');
const { PLANS_DATA, PLANS_INDEX } = require('../../constants.js');
const { serialize } = require('../../utils/redis.js');

const mergeWith = require('lodash/mergeWith');
const cloneDeep = require('lodash/cloneDeep');
const reduce = require('lodash/reduce');
const find = require('lodash/find');
const compact = require('lodash/compact');
const isArray = Array.isArray;
const Errors = require('common-errors');

const planGet = require('./get');

function buildQuery(values) {
  const value = omit(values, ['alias', 'hidden', 'id']);
  if (Object.keys(value).length === 0) return null;
  return [{
    op: 'replace',
    path: '/',
    value,
  }];
}

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
    const plan = mergeWith({}, ...plans, merger);
    if (message.plan && message.plan.name) {
      plan.name = message.plan.name;
    }
    return {
      plan,
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
  const { merchant_preferences: merchantPref, payment_definitions } = plan;
  plan.merchant_preferences = merge(defaultMerchantPreferences, merchantPref || {});

  // divide single plan definition into as many as payment_definitions present
  const plans = payment_definitions.map(definition => {
    const partialPlan = {
      ...cloneDeep(plan),
      name: `${plan.name}-${definition.frequency.toLowerCase()}`,
      payment_definitions: [definition],
    };

    const query = buildQuery(partialPlan);
    if (query === null) {
      return null;
    }
    return paypalPlanUpdate(plan.id, query, config.paypal);
  });

  return Promise.all(plans);
}

function createSaveToRedis(redis, message) {
  return function saveToRedis(data) {
    const { plan, plans } = data;
    const aliasedId = message.alias || plan.id;

    const pipeline = redis.pipeline();
    const planKey = key(PLANS_DATA, aliasedId);
    const plansData = reduce(plans, (a, p) => {
      const frequency = p.payment_definitions[0].frequency;
      a[frequency.toLowerCase()] = p.id;
      return a;
    }, { full: aliasedId });

    pipeline.sadd(PLANS_INDEX, aliasedId);

    const subscriptions = message.subscriptions && message.subscriptions.map(subscription => {
      subscription.definition = find(plan.payment_definitions, item => (
        item.frequency.toLowerCase() === subscription.name
      ));
      return subscription;
    }) || null;

    const saveDataFull = {
      plan: {
        ...plan,
      },
      ...plansData,
    };

    if (subscriptions !== null) {
      saveDataFull.subs = subscriptions;
    }

    if (plan.name) {
      saveDataFull.name = plan.name;
    }

    if (plan.state) {
      saveDataFull.state = plan.state;
    }

    if (message.hidden !== null && message.hidden !== undefined) {
      saveDataFull.hidden = message.hidden;
    }

    if (message.alias !== null && message.alias !== undefined) {
      saveDataFull.alias = message.alias;
    }

    pipeline.hmset(planKey, serialize(saveDataFull));

    plans.forEach(planData => {
      const saveData = {
        plan: {
          ...planData,
        },
      };

      if (subscriptions !== null) {
        saveData.subs = [find(subscriptions, { name: planData.payment_definitions[0].frequency.toLowerCase() })];
      }

      if (plan.name) {
        saveData.name = planData.name;
      }

      if (plan.state) {
        saveData.state = planData.state;
      }

      if (message.hidden !== null && message.hidden !== undefined) {
        saveData.hidden = message.hidden;
      }

      if (message.alias !== null && message.alias !== undefined) {
        saveData.alias = message.alias;
      }

      pipeline.hmset(key(PLANS_DATA, planData.id), serialize(saveData));
    });

    return pipeline.exec().return(saveDataFull);
  };
}

/**
 * Update paypal plan with a special case for a free plan
 * @param  {Object} message
 * @return {Promise}
 */
module.exports = function planUpdate(message) {
  const { config, redis } = this;
  const { alias } = message;
  const saveToRedis = createSaveToRedis(redis, message);
  let promise = Promise.bind(this);

  if (alias && alias !== 'free') {
    promise = redis.sismember(PLANS_INDEX, alias).then(isMember => {
      if (isMember !== 1) {
        throw new Errors.HttpStatusError(400, `plan ${alias} does not exist`);
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
