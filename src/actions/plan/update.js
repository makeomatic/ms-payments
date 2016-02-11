const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const Errors = require('common-errors');
const paypalPlanUpdate = Promise.promisify(paypal.billingPlan.update, {context: paypal.billingPlan}); // eslint-disable-line

const map = require('lodash/map');
const assign = require('lodash/assign');
const mergeWith = require('lodash/mergeWith');
const findIndex = require('lodash/findIndex');
const get = require('lodash/get');

const { PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID } = require('../../constants.js');
const { serialize } = require('../../utils/redis.js');
const { merger } = require('../../utils/plans.js');

const key = require('../../redisKey.js');
const planGet = require('./get');

function joinPlans(plans) {
  const plan = mergeWith({}, ...plans, merger);
  return {
    plan,
    plans,
  };
}

function finder(pattern, path) {
  return function findPattern(element) {
    return get(element, path).toLowerCase().indexOf(pattern.toLowerCase()) >= 0;
  };
}

function prepareUpdate(subscription, plans, period) {
  const index = findIndex(plans, finder(period, 'plan.name'));
  const planData = plans[index];

  if (subscription.models) {
    // these plans always have only 1 entry
    planData.subs[0].models = subscription.models;
  }

  if (subscription.modelPrice) {
    // these plans always have only 1 entry
    planData.subs[0].modelPrice = subscription.modelPrice;
  }
}

function updateSubscriptions(plans, subscriptions) {
  if (subscriptions.monthly) {
    prepareUpdate(subscriptions.monthly, plans, 'month');
  }

  if (subscriptions.yearly) {
    prepareUpdate(subscriptions.yearly, plans, 'year');
  }
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

function createSaveToRedis(message) {
  return Promise
    .bind(this, message.id.split('|'))
    .map(planGet)
    .then(function updatePlansInRedis(plans) {
      const additionalData = {};

      if (message.subscriptions) {
        updateSubscriptions(plans, message.subscriptions);
      }

      if (message.description) {
        setField(plans, 'description', message.description);
      }

      if (message.alias) {
        additionalData.alias = message.alias;
      }

      if (message.hidden) {
        additionalData.hidden = message.hidden;
      }

      return { plans, additionalData };
    });
}

function saveToRedis({ plans, additionalData }) {
  const { redis } = this;
  const data = joinPlans(plans);
  const currentAlias = data.plan.alias;
  const saveDataFull = assign(data.plan, additionalData);
  const aliasedId = saveDataFull.alias;
  const pipeline = redis.pipeline();
  const planKey = key(PLANS_DATA, aliasedId);

  // if we are changing alias - that requires checking if new alias already exists
  if (aliasedId !== currentAlias) {
    pipeline.srem(PLANS_INDEX, currentAlias);
    pipeline.del(key(PLANS_DATA, currentAlias));
  }

  pipeline.sadd(PLANS_INDEX, aliasedId);
  pipeline.hmset(planKey, serialize(saveDataFull));
  plans.forEach(planData => {
    const saveData = assign(planData, additionalData);
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
  const { redis } = this;
  const { alias, id } = message;

  if (id !== FREE_PLAN_ID && id.indexOf('|') === -1) {
    return Promise.reject(new Errors.HttpStatusError(400, `invalid plan id: ${id}`));
  }

  // message.alias can never be equal to FREE_PLAN_ID, because it's check in json-schema
  // therefore we only need to check if message.alias already exists

  return Promise
    .bind(this, message)
    .tap(() => {
      if (!alias) {
        return null;
      }

      return redis.sismember(PLANS_INDEX, alias).then(isMember => {
        if (isMember) {
          throw new Errors.HttpStatusError(409, `alias ${alias} already exists`);
        }
      });
    })
    .tap(() => {
      return redis.exists(key(PLANS_DATA, id)).then(exists => {
        if (!exists) {
          throw new Errors.HttpStatusError(404, `plan ${id} does not exist`);
        }
      });
    })
    .then(createSaveToRedis)
    .then(saveToRedis);
};
