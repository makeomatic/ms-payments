const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const Errors = require('common-errors');
const paypalPlanUpdate = Promise.promisify(paypal.billingPlan.update, {context: paypal.billingPlan}); // eslint-disable-line

const omit = require('lodash/omit');
const map = require('lodash/map');
const merge = require('lodash/merge');
const mergeWith = require('lodash/mergeWith');
const reduce = require('lodash/reduce');
const findIndex = require('lodash/findIndex');

const { PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID } = require('../../constants.js');
const { serialize } = require('../../utils/redis.js');
const { merger } = require('../../utils/plans.js');

const key = require('../../redisKey.js');
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

function prepareUpdate(paypalQuery, subscription, plans, period) {
  const periodLookup = finder(period);
  const index = findIndex(plans, periodLookup);

  if (subscription.price) {
    const price = subscription.price.toPrecision(2);
    const indexForPeriod = findIndex(plans[index].plan.payment_definitions, periodLookup);
    const plan = plans[index].plan;

    plan.payment_definitions[indexForPeriod].amount.value = price;

    paypalQuery[plan.id] = {
      payment_definitions: [{
        amount: {
          value: price,
        },
      }],
    };
  }

  if (subscription.models) {
    const indexForPeriod = findIndex(plans[index].subs, periodLookup);
    plans[index].subs[indexForPeriod].models = subscription.models;
  }

  if (subscription.modelPrice) {
    const indexForPeriod = findIndex(plans[index].subs, periodLookup);
    plans[index].subs[indexForPeriod].modelPrice = subscription.modelPrice;
  }
}

function updateSubscriptions(plans, subscriptions) {
  const paypalQuery = {};

  if (subscriptions.monthly) {
    prepareUpdate(paypalQuery, subscriptions.monthly, plans, 'month');
  }

  if (subscriptions.yearly) {
    prepareUpdate(paypalQuery, subscriptions.yearly, plans, 'year');
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
  }

  return setPlanField(plans);
}

function createSaveToRedis({ config, redis, message }) {
  return Promise
    .bind(this, message.id.split('|'))
    .map(planGet)
    .then(function updatePlansInRedis(plans) {
      const paypalQuery = {};
      const additionalData = {};

      if (message.subscriptions) {
        const paypalUpdate = updateSubscriptions(plans, message.subscriptions);
        merge(paypalQuery, paypalUpdate);
      }

      if (message.description) {
        paypalQuery.common = { description: message.description };
        setField(plans, 'description', message.description);
      }

      if (message.alias) {
        additionalData.alias = message.alias;
      }

      if (message.hidden) {
        additionalData.hidden = message.hidden;
      }

      return { paypalQuery, plans, additionalData, config, redis };
    });
}

function queryPaypal({ paypalQuery, plans, additionalData, config, redis }) {
  const paypalObjects = omit(paypalQuery, 'common');
  const query = map(paypalObjects, function makePayPalRequest(values, id) {
    let vals;
    if (paypalQuery.common) {
      vals = merge(values, { description: paypalQuery.common.description });
    } else {
      vals = values;
    }

    const request = buildQuery(vals);
    return paypalPlanUpdate(id, request, config.paypal);
  });

  return Promise.all(query).return({ plans, additionalData, config, redis });
}

function saveToRedis({ plans, additionalData, redis }) {
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
  if (alias && alias !== FREE_PLAN_ID) {
    exists.push(redis.sismember(PLANS_INDEX, alias));
  }

  let promise = Promise.all(exists).then(isMember => {
    const count = reduce(isMember, (acc, member) => acc + member, 0);
    if (count === 0) {
      throw new Errors.HttpStatusError(400, `plan ${message.id}/${alias} does not exist`);
    }
    return { config, redis, message };
  });

  promise = promise.then(createSaveToRedis);

  // this is a free plan, don't put it on paypal
  if (alias !== FREE_PLAN_ID) {
    promise = promise.then(queryPaypal);
  }

  return promise.then(saveToRedis);
};
