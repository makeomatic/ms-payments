const key = require('../../redisKey.js');
const { hmget } = require('../../listUtils.js');
const Errors = require('common-errors');
const EXTRACT_FIELDS = ['plan', 'subs', 'alias', 'hidden'];
const responseParser = hmget(EXTRACT_FIELDS, JSON.parse, JSON);
const { PLANS_DATA } = require('../../constants.js');

function planGet(id) {
  const { redis } = this;
  const planKey = key(PLANS_DATA, id);

  return redis
    .exists(planKey)
    .then(exists => {
      if (!exists) {
        throw new Errors.HttpStatusError(404, `plan ${id} not found`);
      }

      return redis.hmget(planKey, EXTRACT_FIELDS);
    })
    .then(responseParser);
}

module.exports = planGet;
