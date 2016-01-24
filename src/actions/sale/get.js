const { SALES_DATA_PREFIX } = require('../../constants.js');
const key = require('../../redisKey.js');
const JSONParse = JSON.parse.bind(JSON);
const Errors = require('common-errors');
const mapValues = require('lodash/mapValues');

module.exports = function saleGet(opts) {
  const { redis } = this;
  const { owner, id } = opts;
  const saleKey = key(SALES_DATA_PREFIX, id);

  return redis
    .hgetallBuffer(saleKey, id)
    .then(data => {
      if (!data) {
        throw new Errors.HttpStatusError(404, `payment id ${id} missing`);
      }

      const output = mapValues(data, JSONParse);
      if (owner !== output.owner) {
        throw new Errors.HttpStatusError(403, `no access to payment ${id}`);
      }

      return output;
    });
};
