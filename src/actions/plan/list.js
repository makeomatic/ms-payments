const { processResult, mapResult } = require('../../listUtils');
const fsort = require('redis-filtered-sort');
const key = require('../../redisKey.js');
const { PLANS_DATA, PLANS_INDEX } = require('../../constants.js');

function planList(opts) {
  const { redis } = this;
  const { filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .fsort(PLANS_INDEX, key(PLANS_DATA, '*'), criteria, order, strFilter, offset, limit)
    .then(processResult(PLANS_DATA, redis))
    .spread(mapResult(offset, limit));
}

module.exports = planList;
