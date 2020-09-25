const { ActionTransport } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../list-utils');
const { SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants');
const key = require('../../redis-key');

/**
 * @api {amqp} <prefix>.sale.list List sales
 * @apiVersion 1.0.0
 * @apiName saleList
 * @apiGroup Sale
 *
 * @apiDescription Returns list of the sales
 *
 * @apiSchema {jsonschema=sale/list.json} apiRequest
 * @apiSchema {jsonschema=response/sale/list.json} apiResponse
 */
function saleList({ params: opts }) {
  const { redis } = this;
  const { filter, criteria } = opts;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .fsort(SALES_ID_INDEX, key(SALES_DATA_PREFIX, '*'), criteria, order, strFilter, Date.now(), offset, limit)
    .then(processResult(SALES_DATA_PREFIX, redis))
    .spread(mapResult(offset, limit));
}

saleList.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = saleList;
