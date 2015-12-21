const key = require('../../redisKey.js');
const { hmget } = require('../../listUtils.js');

const EXTRACT_FIELDS = ['plan', 'subs', 'alias', 'hidden'];
const responseParser = hmget(EXTRACT_FIELDS, JSON.parse, JSON);

function planGet(id) {
  const { redis } = this;
  const planKey = key('plans-data', id);

  return redis
    .hmget(planKey, EXTRACT_FIELDS)
    .then(responseParser);
}

module.exports = planGet;
