const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');

const acquireLock = require('../../utils/acquire-lock');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');

/**
 * @api {amqp} <prefix>.balance.decrement Decrement balance
 * @apiVersion 1.0.0
 * @apiName balanceDecrement
 * @apiGroup Balance
 *
 * @apiSchema {jsonschema=balance/decrement.json} apiRequest
 * @apiSchema {jsonschema=response/balance/decrement.json} apiResponse
 */
async function decrementBalanceAction(service, request) {
  const { ownerId, amount, idempotency, goal } = request.params;

  return service.balance.decrement(ownerId, amount, idempotency, goal);
}

async function wrappedAction(request) {
  return Promise
    .using(this, request, acquireLock(
      this, `tx!balance:decrement:${request.params.owner}:${request.params.idempotency}`
    ), decrementBalanceAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.transports = [ActionTransport.amqp];

module.exports = wrappedAction;
