const Errors = require('common-errors');

// helpers
const key = require('../../redisKey.js');
const { hmget } = require('../../listUtils.js');
const { PLANS_DATA } = require('../../constants.js');

// constants
const EXTRACT_FIELDS = ['plan', 'subs', 'alias', 'hidden'];
const responseParser = hmget(EXTRACT_FIELDS, JSON.parse, JSON);

function planGet({ params: id }) {
  const { redis } = this;
  const planKey = key(PLANS_DATA, id);

  return redis
    .pipeline()
    .exists(planKey)
    .hmget(planKey, EXTRACT_FIELDS)
    .exec()
    .spread((exists, data) => {
      if (!exists) {
        throw new Errors.HttpStatusError(404, `plan ${id} not found`);
      }

      return responseParser(data);
    });
}

module.exports = planGet;
