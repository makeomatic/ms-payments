const { ActionTransport } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');

const { listRedisKey, dataRedisKey } = require('../../utils/charge');
const { processResult, mapResult } = require('../../list-utils');

// @todo omit metadata keys
async function chargesListAction({ params }) {
  const { owner, offset, limit } = params;
  const result = await this.redis
    .fsort(listRedisKey(owner), dataRedisKey('*'), 'createAt', 'DESC', fsort.filter({}), Date.now(), offset, limit)
    .then(processResult(dataRedisKey('*').split(':')[0], this.redis))
    .spread(mapResult(offset, limit, false));

  return result;
}

chargesListAction.transports = [ActionTransport.amqp];

module.exports = chargesListAction;
