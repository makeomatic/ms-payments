const { processResult, mapResult } = require('../../listUtils');
const fsort = require('redis-filtered-sort');

function planList(opts) {
  const { redis } = this;
  const { filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .fsort('agreements-index', 'agreements-data:*', criteria, order, strFilter, offset, limit)
    .then(processResult('agreements-data', redis))
    .spread(mapResult(offset, limit));
}

module.exports = planList;
