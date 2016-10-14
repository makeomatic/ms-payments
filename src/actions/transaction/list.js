const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../listUtils');
const key = require('../../redisKey.js');
const { AGREEMENT_TRANSACTIONS_INDEX, AGREEMENT_TRANSACTIONS_DATA } = require('../../constants.js');

function planList({ params: opts }) {
  const { redis } = this;
  const { filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;
  const meta = key(AGREEMENT_TRANSACTIONS_DATA, '*');

  return redis
    .fsort(AGREEMENT_TRANSACTIONS_INDEX, meta, criteria, order, strFilter, offset, limit)
    .then(processResult(AGREEMENT_TRANSACTIONS_DATA, redis))
    .spread(mapResult(offset, limit));
}

module.exports = planList;
