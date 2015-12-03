const { processResult, mapResult } = require('../../listUtils');

function planList(opts) {
  const { redis } = this;
  const { filter } = opts;
  const criteria = opts.criteria || 'startedAt';
  const strFilter = typeof filter === 'string' ? filter : JSON.stringify(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .sortedFilteredPaymentsList('transaction-index', 'transaction-data:*', criteria, order, strFilter, offset, limit)
    .then(processResult('transaction-data', redis))
    .spread(mapResult(offset, limit));
}

module.exports = planList;
