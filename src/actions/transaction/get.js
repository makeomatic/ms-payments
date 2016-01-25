const key = require('../../redisKey.js');
const JSONParse = JSON.parse.bind(JSON);
const Errors = require('common-errors');
const mapValues = require('lodash/mapValues');
const { TRANSACTIONS_COMMON_DATA } = require('../../constants.js');

module.exports = function saleGet(opts) {
  const { redis } = this;
  const { owner, id } = opts;
  const transactionData = key(TRANSACTIONS_COMMON_DATA, id);

  return redis
    .hgetallBuffer(transactionData)
    .then(data => {
      if (!data) {
        throw new Errors.HttpStatusError(404, `transaction id ${id} missing`);
      }

      const output = mapValues(data, JSONParse);
      if (owner && owner !== output.owner) {
        throw new Errors.HttpStatusError(403, `no access to transaction ${id}`);
      }

      return output;
    });
};
