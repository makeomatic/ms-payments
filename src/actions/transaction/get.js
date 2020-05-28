const { ActionTransport } = require('@microfleet/core');
const Errors = require('common-errors');
const is = require('is');

// helpers
const key = require('../../redis-key');
const { deserialize } = require('../../utils/redis');
const { TRANSACTIONS_COMMON_DATA } = require('../../constants');

async function saleGet({ params: opts }) {
  const { redis } = this;
  const { owner, id } = opts;
  const transactionData = key(TRANSACTIONS_COMMON_DATA, id);

  const data = await redis.hgetall(transactionData);

  if (is.empty(data)) {
    throw new Errors.HttpStatusError(404, `transaction id ${id} missing`);
  }

  const output = deserialize(data);
  if (owner && owner !== output.owner) {
    throw new Errors.HttpStatusError(403, `no access to transaction ${id}`);
  }

  return output;
}

saleGet.transports = [ActionTransport.amqp];

module.exports = saleGet;
