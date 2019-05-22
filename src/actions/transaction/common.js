const { ActionTransport } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../list-utils');
const { TRANSACTIONS_INDEX, TRANSACTIONS_COMMON_DATA } = require('../../constants');
const key = require('../../redis-key');

/**
 * List files
 * @return {Promise}
 */
function listCommonTransactions({ params: opts }) {
  const { redis } = this;
  const { owner, type, filter } = opts;
  const { criteria } = opts;
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
    .fsort(index, key(TRANSACTIONS_COMMON_DATA, '*'), criteria, order, strFilter, Date.now(), offset, limit)
    .then(processResult(TRANSACTIONS_COMMON_DATA, redis))
    .spread(mapResult(offset, limit));
}

listCommonTransactions.transports = [ActionTransport.amqp];

module.exports = listCommonTransactions;
