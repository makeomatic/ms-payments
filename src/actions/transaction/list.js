const { ActionTransport } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../list-utils');
const key = require('../../redis-key');
const { AGREEMENT_TRANSACTIONS_INDEX, AGREEMENT_TRANSACTIONS_DATA } = require('../../constants');

/**
 * @api {amqp} <prefix>.transaction.list List transactions
 * @apiVersion 1.0.0
 * @apiName transactionList
 * @apiGroup Transaction
 *
 * @apiDescription Return the list of the agreement transactions data
 *
 * @apiSchema {jsonschema=transaction/list.json} apiRequest
 * @apiSchema {jsonschema=response/transaction/list.json} apiResponse
 */
function planList({ params: opts }) {
  const { redis } = this;
  const { filter, criteria } = opts;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;
  const meta = key(AGREEMENT_TRANSACTIONS_DATA, '*');

  return redis
    .fsort(AGREEMENT_TRANSACTIONS_INDEX, meta, criteria, order, strFilter, Date.now(), offset, limit)
    .then(processResult(AGREEMENT_TRANSACTIONS_DATA, redis))
    .spread(mapResult(offset, limit));
}

planList.transports = [ActionTransport.amqp];

module.exports = planList;
