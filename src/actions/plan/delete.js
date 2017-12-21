const Promise = require('bluebird');
const { HttpStatusError } = require('bluebird');

// internal actions
const setState = require('./state');

// helpers
const key = require('../../redisKey');
const { cleanupCache } = require('../../listUtils');
const {
  PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID, PLAN_ALIAS_FIELD,
} = require('../../constants');

function deleteFromRedis(id, redis) {
  // and delete plan from redis
  const planKey = key(PLANS_DATA, id);
  const pipeline = redis.pipeline();

  return redis.hget(planKey, PLAN_ALIAS_FIELD).then((alias) => {
    const aliasedId = alias && alias.length > 0 ? JSON.parse(alias) : id;

    pipeline.del(planKey);
    pipeline.srem(PLANS_INDEX, id);

    if (aliasedId !== id) {
      pipeline.srem(PLANS_INDEX, aliasedId);
      pipeline.del(key(PLANS_DATA, aliasedId));
    }

    return pipeline.exec();
  });
}

function actualDelete(id) {
  const { redis } = this;
  if (id.indexOf('|') >= 0) {
    return deleteFromRedis(id, redis);
  }

  return setState
    .call(this, { params: { id, state: 'inactive' } })
    .then(() => deleteFromRedis(id, redis));
}

function planDelete({ params: id }) {
  if (id === FREE_PLAN_ID) {
    return Promise.reject(new HttpStatusError(400, 'unable to delete free plan'));
  }

  const ids = id.split('|');
  if (ids.length > 1) {
    ids.push(id); // also delete full id
  }

  return Promise
    .bind(this, ids)
    .map(actualDelete)
    .return(PLANS_INDEX)
    .then(cleanupCache);
}

module.exports = planDelete;
