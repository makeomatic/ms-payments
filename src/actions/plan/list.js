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
    .sortedFilteredPaymentsList('plans-index', 'plans-data:*', criteria, order, strFilter, offset, limit)
    .then(processResult('plans-data', redis))
    .spread(mapResult(offset, limit))
    .then((data) => {
      data.items = data.items.map((item) => {
        item.plan = JSON.parse(item.plan);
        item.subs = JSON.parse(item.subs);

        return item;
      });

      return data;
    });
}

module.exports = planList;
