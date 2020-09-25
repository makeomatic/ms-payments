const fsort = require('redis-filtered-sort');
const { ActionTransport } = require('@microfleet/core');

// helpers
const { processResult, mapResult } = require('../../list-utils');
const { AGREEMENT_DATA, AGREEMENT_INDEX } = require('../../constants');
const key = require('../../redis-key');

/**
 * @api {amqp} <prefix>.agreement.list List Agreements
 * @apiVersion 1.0.0
 * @apiName list
 * @apiGroup Agreement
 *
 * @apiDescription Returns list of the agreements
  *
 * @apiSchema {jsonschema=agreement/list.json} apiRequest
 * @apiSchema {jsonschema=response/agreement/list.json} apiResponse
 */
function planList({ params: opts }) {
  const { redis } = this;
  const { filter, owner, criteria } = opts;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  let index = AGREEMENT_INDEX;
  if (owner) {
    index = key(index, owner);
  }

  return redis
    .fsort(index, key(AGREEMENT_DATA, '*'), criteria, order, strFilter, Date.now(), offset, limit)
    .then(processResult(AGREEMENT_DATA, redis))
    .spread(mapResult(offset, limit));
}

planList.transports = [ActionTransport.amqp, ActionTransport.internal];
module.exports = planList;
