const key = require('../../redisKey.js');
const Errors = require('common-errors');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants.js');
const { deserialize } = require('../../utils/redis.js');

module.exports = function getAgreement(message) {
  const { redis } = this;
  const { id, owner } = message;
  const agreementKey = key(AGREEMENT_DATA, id);

  if (id === FREE_PLAN_ID) {
    // no data, sorry
    return {
      agreement: { id },
      owner,
      plan: id,
    };
  }

  return redis
    .hgetall(agreementKey)
    .then(data => {
      if (!data) {
        throw new Errors.HttpStatusError(404, `agreement ${id} not found`);
      }

      const output = deserialize(data);
      if (owner && output.owner !== owner) {
        throw new Errors.HttpStatusError(403, `no access to ${id}`);
      }

      return output;
    });
};
