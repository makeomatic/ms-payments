const state = require('./state.js');
const key = require('../../redisKey.js');
const Promise = require('bluebird');
const { cleanupCache } = require('../../listUtils.js');
const { PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID } = require('../../constants.js');

function deleteFromRedis(id, redis) {
  // and delete plan from redis
  const planKey = key(PLANS_DATA, id);
  const pipeline = redis.pipeline();

  return redis.hgetBuffer(planKey, 'alias').then(alias => {
    const aliasedId = alias && alias.length > 0 && JSON.parse(alias) || id;

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

  return state
    .call(this, { id, state: 'deleted' })
    .then(() => deleteFromRedis(id, redis));
}

function planDelete(id) {
  if (id === FREE_PLAN_ID) {
    return Promise.resolve(1);
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
