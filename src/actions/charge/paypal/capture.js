const { ActionTransport } = require('@microfleet/core');
const { HttpStatusError } = require('common-errors');
const assert = require('assert');

const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_AUTHORIZED, retreiveAuthorizationId } = require('../../../utils/charge');
const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../../utils/json-api');
const { LOCK_PAYPAL_CHARGE_COMPLETE } = require('../../../constants');

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

const actionWrapper = lockWrapper(paypalCaptureAction, ...LOCK_PAYPAL_CHARGE_COMPLETE);

actionWrapper.transports = [ActionTransport.amqp];

module.exports = actionWrapper;
