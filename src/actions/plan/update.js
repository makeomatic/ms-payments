const Promise = require('bluebird');
const Errors = require('common-errors');
const set = require('lodash/set');
const assign = require('lodash/assign');
const mergeWith = require('lodash/mergeWith');
const findIndex = require('lodash/findIndex');
const get = require('lodash/get');
const each = require('lodash/each');

// helpers
const {
  PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID, PLAN_ALIAS_FIELD,
} = require('../../constants');
const { serialize, deserialize } = require('../../utils/redis');
const { merger } = require('../../utils/plans');
const { cleanupCache } = require('../../listUtils');
const key = require('../../redisKey');

// constants
const DATA_HOLDERS = {
  monthly: 'month',
  yearly: 'year',
};

const FIELDS_TO_UPDATE = [PLAN_ALIAS_FIELD, 'hidden', 'meta', 'level'];

function joinPlans(plans) {
  const plan = mergeWith({}, ...plans, merger);
  return { plan, plans };
}

function prepareUpdate(subscription, plans, period) {
  const index = findIndex(plans, it => get(it, 'plan.payment_definitions[0].frequency', '').toLowerCase() === period);
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
    const subscription = subscriptions[containerKey];
    if (subscription) {
      prepareUpdate(subscription, plans, period);
    }
  });
}

function setField(_plans, path, value) {
  const plans = Array.isArray(_plans) ? _plans : [_plans];
  return plans.forEach(plan => set(plan, path, value));
}

function createSaveToRedis(message) {
  const { redis } = this;
  return Promise
    .bind(this, message.id.split('|'))
    .map(id => redis.hgetall(key(PLANS_DATA, id)).then(deserialize))
    .then(function updatePlansInRedis(plans) {
      const additionalData = {};

      if ('subscriptions' in message) {
        updateSubscriptions(plans, message.subscriptions);
      }

      if ('description' in message) {
        setField(plans, 'plan.description', message.description);
      }

      FIELDS_TO_UPDATE.forEach((field) => {
        if (field in message) {
          additionalData[field] = message[field];
        }
      });

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

  const serializedData = serialize(saveDataFull);
  pipeline.sadd(PLANS_INDEX, aliasedId);
  pipeline.hmset(planKey, serializedData);

  if (saveDataFull.id !== aliasedId) {
    pipeline.hmset(key(PLANS_DATA, saveDataFull.id), serializedData);
  }

  // free plan id contains only 1 plan and it has same id as alias
  if (aliasedId !== FREE_PLAN_ID) {
    plans.forEach((planData) => {
      const saveData = assign(planData, additionalData);
      pipeline.hmset(key(PLANS_DATA, planData.id), serialize(saveData));
    });
  }

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
module.exports = function planUpdate({ params }) {
  const { redis } = this;
  const { alias, id } = params;

  if (id !== FREE_PLAN_ID && id.indexOf('|') === -1) {
    return Promise.reject(new Errors.HttpStatusError(400, `invalid plan id: ${id}`));
  }

  // message.alias can never be equal to FREE_PLAN_ID, because it's check in json-schema
  // therefore we only need to check if message.alias already exists

  return Promise
    .bind(this, params)
    .tap(() => {
      if (!alias) {
        return null;
      }

      return redis.sismember(PLANS_INDEX, alias).then((isMember) => {
        if (isMember) {
          throw new Errors.HttpStatusError(409, `alias ${alias} already exists`);
        }

        return null;
      });
    })
    .tap(() => {
      return redis.exists(key(PLANS_DATA, id)).then((exists) => {
        if (!exists) {
          throw new Errors.HttpStatusError(404, `plan ${id} does not exist`);
        }

        return null;
      });
    })
    .then(createSaveToRedis)
    .then(saveToRedis)
    .tap(() => cleanupCache.call(this, PLANS_INDEX));
};
