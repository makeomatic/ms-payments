const key = require('../../redisKey.js');

function planGet(id) {
  const { redis } = this;
  const planKey = key('plans-data', id);

  return redis
    .hmget(planKey, 'plan', 'subs', 'alias', 'hidden')
    .then(data => {
      return {
        plan: JSON.parse(data[0]),
        subscriptions: JSON.parse(data[1]),
        alias: data[2],
        hidden: data[3],
      };
    });
}

module.exports = planGet;
