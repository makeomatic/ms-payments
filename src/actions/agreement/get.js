const Errors = require('common-errors');
const is = require('is');
const { ActionTransport } = require('@microfleet/core');

// helpers
const key = require('../../redisKey.js');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants.js');
const { deserialize } = require('../../utils/redis.js');

async function getAgreement({ params: message }) {
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

  const data = await redis.hgetall(agreementKey);
  if (is.empty(data)) {
    throw new Errors.HttpStatusError(404, `agreement ${id} not found`);
  }

  const output = deserialize(data);
  if (owner && output.owner !== owner) {
    throw new Errors.HttpStatusError(403, `no access to ${id}`);
  }

  return output;
}

getAgreement.transports = [ActionTransport.amqp];

module.exports = getAgreement;
