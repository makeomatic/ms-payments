const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const moment = require('moment');
const acquireLock = require('../../utils/acquire-lock');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');
const TRANSACTION_UPDATED_STATUS = JSON.stringify('Updated');
async function getUpdatedTransactions(ctx, offset = 0, agreements = new Set(), txIds = new Set()) {
  const { page, pages, cursor, items } = await ctx.dispatch('transaction.common', {
    params: {
      offset,
      limit: 100,
      type: 'subscription',
      filter: {
        status: { some: [TRANSACTION_UPDATED_STATUS] },
      },
    },
  });

  ctx.log.info({ items }, 'fetched items with %s status', TRANSACTION_UPDATED_STATUS);

  for (const item of items.values()) {
    ctx.log.info({ item }, 'processing item');
    agreements.add(item.agreementId);
    txIds.add(item.id);
  }

  if (page < pages) {
    return getUpdatedTransactions(ctx, cursor, agreements, txIds);
  }

  return { agreements, txIds };
}

async function performSync(ctx, { log }) {
  const { agreements, txIds } = await getUpdatedTransactions(ctx);

  // done - nothing to sync
  if (agreements.size === 0) {
    return 0;
  }

  log.info({ txIds: Array.from(txIds), agreements: Array.from(agreements) }, 'found Updated tx ids in agreements');

  const start = moment().subtract(2, 'years').startOf('year').format('YYYY-MM-DD');
  const end = moment().endOf('year').format('YYYY-MM-DD');
  const initialSize = txIds.size;

  // we are fine to do this serially
  for (const agreementId of agreements) {
    // eslint-disable-next-line no-await-in-loop
    const { transactions } = await ctx.dispatch('transaction.sync', { params: {
      id: agreementId,
      start,
      end,
    } });

    // "transactions": [{
    //   "transaction_id": "0SN03939JA242925G",
    //   "status": "Updated",
    //   "transaction_type": "Recurring Payment",
    //   "amount": {
    //     "currency": "USD",
    //     "value": "49.99"
    //   },
    //   "fee_amount": {
    //     "currency": "USD",
    //     "value": "-1.75"
    //   },
    //   "net_amount": {
    //     "currency": "USD",
    //     "value": "48.24"
    //   },
    //   "payer_email": "test@cappasity.com",
    //   "payer_name": "Test Cappasity",
    //   "time_stamp": "2020-05-26T04:05:26Z",
    //   "time_zone": "GMT"
    // }],

    for (const tx of transactions.values()) {
      if (tx.status === 'Completed') {
        txIds.delete(tx.transaction_id);
      }
    }
  }

  // amount of transactions moved from Updated to Completed
  return initialSize - txIds.size;
}

/**
 * @api {amqp} <prefix>.transaction.sync-updated Sync Updated transactions
 * @apiVersion 1.0.0
 * @apiName transactionSync
 * @apiGroup Transaction
 *
 * @apiDescription Syncs updated transactions for agreement
 *
 * @apiSchema {jsonschema=transaction/sync-updated.json} apiRequest
 * @apiSchema {jsonschema=response/transaction/sync-updated.json} apiResponse
 */
async function txUpdatedSync(request) {
  return Promise
    .using(this, request, acquireLock(this, 'tx!charge:paypal:sync:updated'), performSync)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

txUpdatedSync.transports = [ActionTransport.amqp];

module.exports = txUpdatedSync;
