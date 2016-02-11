const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const paypalPlanUpdate = Promise.promisify(paypal.billingPlan.update, {context: paypal.billingPlan}); // eslint-disable-line

const omit = require('lodash/omit');
const map = require('lodash/map');
const merge = require('lodash/merge');
const { PLANS_DATA, PLANS_INDEX } = require('../../constants.js');
const { serialize } = require('../../utils/redis.js');

const mergeWith = require('lodash/mergeWith');
const cloneDeep = require('lodash/cloneDeep');
const reduce = require('lodash/reduce');
const find = require('lodash/find');
const findIndex = require('lodash/findIndex');
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

function joinPlans(plans) {
  const plan = mergeWith({}, ...plans, merger);
  return {
    plan,
    plans,
  };
}

function finder(pattern) {
  return function findPattern(element) {
    return element.plan.name.toLowerCase().indexOf(pattern.toLowerCase()) >= 0;
  };
}

function updateSubscriptions(plans, subscriptions) {
  const paypalQuery = {};

  if (subscriptions.monthly) {
    const index = findIndex(plans, finder('month'));
    if (subscriptions.monthly.price) {
      const monthlyIndex = findIndex(plans[index].plan.payment_definitions, finder('month'));
      plans[index].plan.payment_definitions[monthlyIndex].amount.value = subscriptions.monthly.price.toPrecision(2);
      paypalQuery[plans[index].plan.id] = {
        payment_definitions: [{
          amount: {
            value: subscriptions.monthly.price.toPrecision(2),
          },
        }],
      };
    }
    if (subscriptions.monthly.models) {
      const monthlyIndex = findIndex(plans[index].subs, finder('month'));
      plans[index].subs[monthlyIndex].models = subscriptions.monthly.models;
    }
    if (subscriptions.monthly.modelPrice) {
      const monthlyIndex = findIndex(plans[index].subs, finder('month'));
      plans[index].subs[monthlyIndex].modelPrice = subscriptions.monthly.modelPrice;
    }
  }

  if (subscriptions.yearly) {
    const index = findIndex(plans, finder('year'));
    if (subscriptions.yearly.price) {
      const yearlyIndex = findIndex(plans[index].plan.payment_definitions, finder('year'));
      plans[index].plan.payment_definitions[yearlyIndex].amount.value = subscriptions.yearly.price.toPrecision(2);
      paypalQuery[plans[index].plan.id] = {
        payment_definitions: [{
          amount: {
            value: subscriptions.yearly.price.toPrecision(2),
          },
        }],
      };
    }
    if (subscriptions.yearly.models) {
      const yearlyIndex = findIndex(plans[index].subs, finder('year'));
      plans[index].subs[yearlyIndex].models = subscriptions.yearly.models;
    }
    if (subscriptions.yearly.modelPrice) {
      const yearlyIndex = findIndex(plans[index].subs, finder('year'));
      plans[index].subs[yearlyIndex].modelPrice = subscriptions.yearly.modelPrice;
    }
  }

  return paypalQuery;
}

function setField(plans, field, value) {
  const path = field.split('.');
  const len = path.length;

  function setPlanField(plan) {
    let schema = plan;
    for (let i = 0; i < len; i++) {
      const elem = path[i];
      if (!schema[elem]) {
        schema[elem] = {};
      }
      schema = schema[elem];
    }
    schema[path[len - 1]] = value;
    return schema;
  }

  if (Array.isArray(plans)) {
    return map(plans, setPlanField);
  } else {
    return setPlanField(plans);
  }
}

function createSaveToRedis({ config, redis, message }) {
  const ids = map(message.id.split('|'), planGet);
  return Promise.all(ids).then(function updatePlansInRedis(plans) {
    const paypalQuery = {};
    const additionalData = {};
    if (message.subscriptions) {
      const paypalUpdate = updateSubscriptions(plans, message.subscriptions);
      merge(paypalQuery, paypalUpdate);
    }
    if (message.description) {
      paypalQuery.common = {description: message.description};
      setField(plans, 'description', message.description);
    }
    if (message.alias) {
      additionalData.alias = message.alias;
    }
    if (message.hidden) {
      additionalData.hidden = message.hidden;
    }
    return {paypalQuery, plans, additionalData, config, redis};
  });
}

function queryPaypal({ paypalQuery, plans, additionalData, config, redis }) {
  const paypalObjects = omit(paypalQuery, 'common');
  const query = map(paypalObjects, function makePayPalRequest(values, id) {
    let vals;
    if (paypalQuery.common) {
      vals = merge(values, {description: paypalQuery['common'].description});
    } else {
      vals = values;
    }
    const request = buildQuery(vals);
    return paypalPlanUpdate(id, request, config.paypal);
  });
  return Promise.all(query).return({plans, additionalData, config, redis});
}

function saveToRedis({ plans, additionalData, config, redis }) {
  const data = joinPlans(plans);
  const aliasedId = additionalData.alias || data.plan.plan.id;
  const planKey = key(PLANS_DATA, aliasedId);

  const pipeline = redis.pipeline();

  pipeline.sadd(PLANS_INDEX, aliasedId);

  const saveDataFull = merge(data.plan, additionalData);
  pipeline.hmset(planKey, serialize(saveDataFull));

  data.plans.forEach(planData => {
    const saveData = merge(planData, additionalData);
    pipeline.hmset(key(PLANS_DATA, planData.id), serialize(saveData));
  });

  return pipeline.exec().return(saveDataFull);
}

/**
 * Update paypal plan with a special case for a free plan
 * @param  {Object} message
 * @return {Promise}
 */
module.exports = function planUpdate(message) {
  const { config, redis } = this;
  const { alias } = message;

  const exists = [redis.sismember(PLANS_INDEX, message.id)];
  if (alias && alias !== 'free') {
    exists.push(redis.sismember(PLANS_INDEX, alias));
  }

  let promise = Promise.all(exists).then(isMember => {
    const count = reduce(isMember, (acc, member) => {
      return acc + member;
    }, 0);
    if (count === 0) {
      throw new Errors.HttpStatusError(400, `plan ${message.id}/${alias} does not exist`);
    }
    return { config, redis, message };
  });

  promise = promise.then(createSaveToRedis);

  // this is a free plan, don't put it on paypal
  if (alias !== 'free') {
    promise = promise.then(queryPaypal);
  }

  return promise.then(saveToRedis);
};
