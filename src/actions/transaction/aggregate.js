/* eslint-disable */

const Promise = require('bluebird');
const fsort = require('redis-filtered-sort');
const key = require('../../redisKey');

// helpers
const { TRANSACTIONS_INDEX, TRANSACTIONS_COMMON_DATA } = require('../../constants.js');

/**
 * List files
 * @return {Promise}
 */
module.exports = function listCommonTransactions({ params }) {
  const { redis } = this;
  const { owners, type, filter } = params;

  // PSEUDO-CODE
  // ----------------
  // 1. external filter prepares a list of users to fetch data from and passes them to owners
  // 2. we have pre-filtered indices of transactions per user
  // 3. we generate ids of indices for the transactions and then run an aggregate on them

  return Promise.map(owners, (owner) => {
    const index = key(TRANSACTIONS_INDEX, owner, type);


  });
};
