const Errors = require('common-errors');

// helpers
const key = require('../../redisKey');
const { hmget } = require('../../listUtils');
const { PLANS_DATA } = require('../../constants');
const { handlePipeline } = require('../../utils/redis');

// constants
const EXTRACT_FIELDS = ['plan', 'subs', 'alias', 'hidden', 'meta', 'level', 'year', 'month'];
const responseParser = hmget(EXTRACT_FIELDS, JSON.parse, JSON, null);

function planGet({ params: id }) {
  const { redis } = this;
  const planKey = key(PLANS_DATA, id);

  return redis
    .pipeline()
    .exists(planKey)
    .hmget(planKey, EXTRACT_FIELDS)
    .exec()
    .then(handlePipeline)
    .spread((exists, data) => {
      if (!exists) {
        throw new Errors.HttpStatusError(404, `plan ${id} not found`);
      }

      return responseParser(data);
    });
}

module.exports = planGet;
