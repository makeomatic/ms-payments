const Promise = require('bluebird');
const key = require('../../redisKey.js');

function planGet(id) {
  const { redis } = this;
  const promise = Promise.bind(this);

  function getFromRedis() {
    const planKey = key('plans-data', id);
    const pipeline = redis.pipeline;

    pipeline.hget(planKey, 'plan');
    pipeline.hget(planKey, 'subs');
    pipeline.hget(planKey, 'alias');
    pipeline.hget(planKey, 'hidden');

    return pipeline.exec().then((data) => {
      return {
        plan: JSON.parse(data[0]),
        subscriptions: JSON.parse(data[1]),
        alias: data[2],
        hidden: data[3],
      };
    });
  }

  return promise.then(getFromRedis);
}

module.exports = planGet;
