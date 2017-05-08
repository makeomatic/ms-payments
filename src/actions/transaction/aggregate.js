const Promise = require('bluebird');
const fsort = require('redis-filtered-sort');
const key = require('../../redisKey');
const is = require('is');

// helpers
const { TRANSACTIONS_INDEX, TRANSACTIONS_COMMON_DATA } = require('../../constants.js');

/**
 * List files
 * @return {Promise}
 */
module.exports = function listAggregateTransactions({ params }) {
  const { redis, config } = this;
  const { owners, filter, aggregate } = params;

  // prepare key pattern
  const pattern = key(TRANSACTIONS_COMMON_DATA, '*');
  const strFilter = is.string(filter) ? filter : fsort.filter(filter || {});
  const agg = fsort.filter(aggregate);
  const prefixLength = config.redis.options.keyPrefix.length;

  // PSEUDO-CODE
  // ----------------
  // 1. external filter prepares a list of users to fetch data from and passes them to owners
  // 2. we have pre-filtered indices of transactions per user
  // 3. we generate ids of indices for the transactions and then run an aggregate on them

  return Promise.map(owners, (owner) => {
    const index = key(TRANSACTIONS_INDEX, owner);
    return redis
      .fsort(index, pattern, null, 'DESC', strFilter, Date.now(), 0, 0, 5000, 1)
      .then(idlist => redis.fsortAggregate(idlist.slice(prefixLength), pattern, agg))
      .then(JSON.parse);
  });
};
