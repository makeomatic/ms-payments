const { processResult, mapResult } = require('../../listUtils');
const fsort = require('redis-filtered-sort');

/**
 * List files
 * @return {Promise}
 */
module.exports = function listCommonTransactions(opts) {
  const { redis } = this;
  const { owner, filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  // choose which set to use
  let index;
  if (owner) {
    index = `${owner}:transactions`;
  } else {
    index = 'all-transactions';
  }

  return redis
    .fsort(index, 'all-transactions:*', criteria, order, strFilter, offset, limit)
    .then(processResult('transaction-data', redis))
    .spread(mapResult(offset, limit));
};
