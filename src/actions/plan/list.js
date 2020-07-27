const { ActionTransport } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../list-utils');
const key = require('../../redis-key');
const { PLANS_DATA, PLANS_INDEX } = require('../../constants');

/**
 * @api {amqp} <prefix>.plan.list List plans
 * @apiVersion 1.0.0
 * @apiName planList
 * @apiGroup Plan
 *
 * @apiDescription Returns list of the plans
 *
 * @apiSchema {jsonschema=plan/list.json} apiRequest
 * @apiSchema {jsonschema=response/plan/list.json} apiResponse
 */
function planList({ params: opts }) {
  const { redis } = this;
  const { filter, criteria } = opts;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .fsort(PLANS_INDEX, key(PLANS_DATA, '*'), criteria, order, strFilter, Date.now(), offset, limit)
    .then(processResult(PLANS_DATA, redis))
    .spread(mapResult(offset, limit));
}

planList.transports = [ActionTransport.amqp];

module.exports = planList;
