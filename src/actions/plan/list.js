const { processResult, mapResult } = require('../../listUtils');
const ld = require('lodash');

function planList(opts) {
  const { redis } = this;
  const { filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : JSON.stringify(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .sortedFilteredPaymentsList('plans-index', 'plans-data:*', criteria, order, strFilter, offset, limit)
    .then(processResult('plans-data', redis))
    .spread(mapResult(offset, limit))
    .tap(data => {
      data.items = ld.mapValues(data.items, JSON.parse, JSON);
    });
}

module.exports = planList;
