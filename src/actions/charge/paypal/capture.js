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

async function paypalCaptureAction(service, request) {
  const { paymentId } = request.params;
  const chargeId = await service.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);

  const charge = await service.charge.get(chargeId);
  const amount = Number(charge.amount);

  if (charge.status !== STATUS_INITIALIZED) {
    throw alreadyExecutedError;
  }

  const paypalPayment = await service.paypal.capture(paymentId, amount);

  if (paypalPayment.state === 'COMPLETED') {
    const pipeline = service.redis.pipeline();

    await service.charge.markAsComplete(chargeId, paypalPayment.id, paypalPayment, pipeline);
    await service.balance.increment(
      charge.owner,
      Number(charge.amount),
      paypalPayment.id,
      paypalPayment.id, // @TODO goal from params
      pipeline
    );
    await pipeline.exec();
  } else {
    await service.charge.markAsFailed(chargeId, paypalPayment.id, paypalPayment, paypalPayment.reason_code);
  }

  const updatedCharge = await service.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);

  return chargeResponse(updatedCharge, { owner: updatedCharge.owner });
}

async function wrappedAction(request) {
  return Promise
    .using(this, request, acquireLock(
      this, `tx!paypal:capture:${request.params.paymentId}`
    ), paypalCaptureAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.transports = [ActionTransport.amqp];

module.exports = wrappedAction;
