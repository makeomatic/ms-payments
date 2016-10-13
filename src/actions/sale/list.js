const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../listUtils');
const { SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants.js');
const key = require('../../redisKey.js');

function saleList({ params: opts }) {
  const { redis } = this;
  const { filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .fsort(SALES_ID_INDEX, key(SALES_DATA_PREFIX, '*'), criteria, order, strFilter, offset, limit)
    .then(processResult(SALES_DATA_PREFIX, redis))
    .spread(mapResult(offset, limit));
}

module.exports = saleList;
