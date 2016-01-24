const state = require('./state.js');
const key = require('../../redisKey.js');
const Promise = require('bluebird');
const { PLANS_DATA, PLANS_INDEX } = require('../../constants.js');

function deleteFromRedis(id, redis) {
  // and delete plan from redis
  const planKey = key(PLANS_DATA, id);
  const pipeline = redis.pipeline();

  return redis.hget(planKey, 'alias').then(alias => {
    const aliasedId = alias && JSON.parse(alias) || id;

    pipeline.del(planKey);
    pipeline.srem(PLANS_INDEX, aliasedId);
    pipeline.smembers(PLANS_INDEX);

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
  if (id === 'free') {
    return Promise.resolve(1);
  }
  const ids = id.split('|');
  if (ids.length > 1) {
    ids.push(id); // also delete full id
  }
  return Promise.resolve(ids).bind(this).map(actualDelete);
}

module.exports = planDelete;
