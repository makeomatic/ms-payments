const { processResult, mapResult } = require('../../listUtils');
const fsort = require('redis-filtered-sort');
const { TRANSACTIONS_INDEX, TRANSACTIONS_COMMON_DATA } = require('../../constants.js');
const key = require('../../redisKey.js');

/**
 * List files
 * @return {Promise}
 */
module.exports = function listCommonTransactions(opts) {
  const { redis } = this;
  const { owner, type, filter } = opts;
  const criteria = opts.criteria;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  // choose which set to use
  let index = TRANSACTIONS_INDEX;

  // we have separate index for owners
  if (owner) {
    index = key(index, owner);
  }

  // we have a separate index for types and owner:type
  if (type) {
    index = key(index, type);
  }

  return redis
    .fsort(index, key(TRANSACTIONS_COMMON_DATA, '*'), criteria, order, strFilter, offset, limit)
    .then(processResult(TRANSACTIONS_COMMON_DATA, redis))
    .spread(mapResult(offset, limit));
};
