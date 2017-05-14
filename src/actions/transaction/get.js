const Errors = require('common-errors');
const is = require('is');

// helpers
const key = require('../../redisKey.js');
const { deserialize } = require('../../utils/redis.js');
const { TRANSACTIONS_COMMON_DATA } = require('../../constants.js');

module.exports = function saleGet({ params: opts }) {
  const { redis } = this;
  const { owner, id } = opts;
  const transactionData = key(TRANSACTIONS_COMMON_DATA, id);

  return redis
    .hgetall(transactionData)
    .then((data) => {
      if (is.empty(data)) {
        throw new Errors.HttpStatusError(404, `transaction id ${id} missing`);
      }

      const output = deserialize(data);
      if (owner && owner !== output.owner) {
        throw new Errors.HttpStatusError(403, `no access to transaction ${id}`);
      }

      return output;
    });
};
