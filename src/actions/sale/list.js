const { ActionTransport } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../list-utils');
const { SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants');
const key = require('../../redis-key');

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

saleList.transports = [ActionTransport.amqp];

module.exports = saleList;
