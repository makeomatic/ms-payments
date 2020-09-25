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

async function paypalCaptureAction(service, request) {
  const { paymentId } = request.params;
  const chargeId = await service.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);

  const charge = await service.charge.get(chargeId);
  const amount = Number(charge.amount);
  const sourceMetadata = JSON.parse(charge.sourceMetadata);
  const authorizationId = retreiveAuthorizationId(sourceMetadata);

  assert.equal(charge.status, STATUS_AUTHORIZED, alreadyExecutedError);

  const paypalPayment = await service.paypal.capture(authorizationId, amount);
  sourceMetadata.authorization = paypalPayment;

  if (paypalPayment.state.toLowerCase() === 'completed') {
    const pipeline = service.redis.pipeline();

    await service.charge.markAsComplete(chargeId, paymentId, sourceMetadata, pipeline);
    await service.balance.increment(
      charge.owner,
      Number(charge.amount),
      paymentId,
      authorizationId, // @TODO goal from params
      pipeline
    );
    await pipeline.exec();
  } else {
    await service.charge.markAsFailed(chargeId, paymentId, sourceMetadata, paypalPayment.reason_code);
  }

  const updatedCharge = await service.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);

  return chargeResponse(updatedCharge, { owner: updatedCharge.owner });
}

/**
 * @api {amqp} <prefix>.charge.paypal.capture Paypal - Capture paypal funds
 * @apiVersion 1.0.0
 * @apiName chargePaypalCreate
 * @apiGroup Charge.Paypal
 *
 * @apiDescription Captures requested `charge`
 *
 * @apiSchema {jsonschema=charge/paypal/capture.json} apiRequest
 * @apiSchema {jsonschema=response/charge/paypal/capture.json} apiResponse
 */
async function wrappedAction(request) {
  // NOTE: lock is the same as in void so that we
  // cant try to void/capture the same payment at the same time
  const lockPromise = acquireLock(this, `tx!paypal:complete:${request.params.paymentId}`);
  return Promise
    .using(this, request, lockPromise, paypalCaptureAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.transports = [ActionTransport.amqp];

module.exports = wrappedAction;
