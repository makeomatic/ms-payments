const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');

const acquireLock = require('../../../utils/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_INITIALIZED } = require('../../../utils/charge');
const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../../utils/json-api');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');
const alreadyExecutedError = new HttpStatusError(400, 'already executed');

async function paypalVoidAction(service, request) {
  const { paymentId } = request.params;
  const chargeId = await service.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);

  const charge = await service.charge.get(chargeId);

  if (charge.status !== STATUS_INITIALIZED) {
    throw alreadyExecutedError;
  }

  const paypalPayment = await service.paypal.void(paymentId);

  if (paypalPayment.state === 'VOIDED') {
    await service.charge.markAsCanceled(chargeId, paypalPayment.id, paypalPayment, paypalPayment.reason_code);
  } else {
    await service.charge.markAsFailed(chargeId, paypalPayment.id, paypalPayment, paypalPayment.reason_code);
  }

  const updatedCharge = await service.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);

  return chargeResponse(updatedCharge, { owner: updatedCharge.owner });
}

async function wrappedAction(request) {
  return Promise
    .using(this, request, acquireLock(
      this, `tx!paypal:void:${request.params.paymentId}`
    ), paypalVoidAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.transports = [ActionTransport.amqp];

module.exports = wrappedAction;
