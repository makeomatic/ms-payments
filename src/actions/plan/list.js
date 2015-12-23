const { processResult, mapResult } = require('../../listUtils');

function planList(opts) {
  const { redis } = this;
  const { filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : JSON.stringify(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .sortedFilteredPaymentsListBuffer('plans-index', 'plans-data:*', criteria, order, strFilter, offset, limit)
    .then(processResult('plans-data', redis))
    .spread(mapResult(offset, limit));
}

module.exports = planList;
