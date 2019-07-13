const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const assert = require('assert');

const acquireLock = require('../../../utils/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_AUTHORIZED, retreiveAuthorizationId } = require('../../../utils/charge');
const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../../utils/json-api');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');
const alreadyExecutedError = new HttpStatusError(400, 'already executed');

async function paypalVoidAction(service, request) {
  const { paymentId } = request.params;
  const chargeId = await service.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);

  const charge = await service.charge.get(chargeId);
  assert.equal(charge.status, STATUS_AUTHORIZED, alreadyExecutedError);
  const sourceMetadata = JSON.parse(charge.sourceMetadata);
  const authorizationId = retreiveAuthorizationId(sourceMetadata);
  const paypalPayment = await service.paypal.void(authorizationId);

  service.log.info({ paypalPayment }, 'voided paypal payment');

  sourceMetadata.authorization = paypalPayment;
  const action = paypalPayment.state.toLowerCase() === 'voided'
    ? 'markAsCanceled'
    : 'markAsFailed';

  await service.charge[action](chargeId, paymentId, sourceMetadata, paypalPayment.reason_code || 'voided');

  const updatedCharge = await service.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);
  return chargeResponse(updatedCharge, { owner: updatedCharge.owner });
}

async function wrappedAction(request) {
  const lockPromise = acquireLock(this, `tx!paypal:complete:${request.params.paymentId}`);
  return Promise
    .using(this, request, lockPromise, paypalVoidAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.transports = [ActionTransport.amqp];

module.exports = wrappedAction;
