const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const Errors = require('common-errors');
const paypalPlanUpdate = Promise.promisify(paypal.billingPlan.update, {context: paypal.billingPlan}); // eslint-disable-line

const set = require('lodash/set');
const assign = require('lodash/assign');
const mergeWith = require('lodash/mergeWith');
const findIndex = require('lodash/findIndex');
const get = require('lodash/get');
const each = require('lodash/each');

const { PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID } = require('../../constants.js');
const { serialize } = require('../../utils/redis.js');
const { merger } = require('../../utils/plans.js');
const { cleanupCache } = require('../../listUtils.js');

const key = require('../../redisKey.js');
const planGet = require('./get');
const DATA_HOLDERS = {
  monthly: 'month',
  yearly: 'year',
};

function joinPlans(plans) {
  const plan = mergeWith({}, ...plans, merger);
  return { plan, plans };
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
    set(planData, 'subs[0].models', subscription.models);
  }

  if (subscription.modelPrice) {
    set(planData, 'subs[0].price', subscription.modelPrice);
  }
}

function updateSubscriptions(plans, subscriptions) {
  each(DATA_HOLDERS, (period, containerKey) => {
    prepareUpdate(subscriptions[containerKey], plans, period);
  });
}

function setField(_plans, path, value) {
  const plans = Array.isArray(_plans) ? _plans : [_plans];
  return plans.forEach(plan => set(plan, path, value));
}

function createSaveToRedis(message) {
  return Promise
    .bind(this, message.id.split('|'))
    .map(planGet)
    .then(function updatePlansInRedis(plans) {
      const additionalData = {};

      if ('subscriptions' in message) {
        updateSubscriptions(plans, message.subscriptions);
      }

      if ('description' in message) {
        setField(plans, 'plan.description', message.description);
      }

      if ('alias' in message) {
        additionalData.alias = message.alias;
      }

      if ('hidden' in message) {
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
    pipeline.rename(key(PLANS_DATA, currentAlias), planKey);
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
 * WARNING: this method is prone to race conditions, and, therefore, requires a lock to be
 * used before updating data
 *
 * TODO: add lock when updating aliases
 *
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
    .then(saveToRedis)
    .tap(() => cleanupCache.call(this, PLANS_INDEX));
};
