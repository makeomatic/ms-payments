const { ActionTransport } = require('@microfleet/core');
const { HttpStatusError } = require('common-errors');
const assert = require('assert');

const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_INITIALIZED } = require('../../../utils/charge');
const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../../utils/json-api');

const alreadyExecutedError = new HttpStatusError(400, 'already executed');

async function paypalReturnAction(service, request) {
  const { paymentId, PayerID: payerId } = request.method === 'amqp' ? request.params : request.query;
  const chargeId = await service.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);
  const charge = await service.charge.get(chargeId);
  assert.equal(charge.status, STATUS_INITIALIZED, alreadyExecutedError);

  const paypalPayment = await service.paypal.execute(paymentId, payerId);
  service.log.info({ paypalPayment }, 'authorized payment');

  // ensure we have an authorize and not an immediate sale
  assert.equal(paypalPayment.intent, 'authorize');

  const args = [chargeId, paymentId, paypalPayment];
  if (paypalPayment.state.toLowerCase() === 'approved') {
    await service.charge.markAsAuthorized(...args);
  } else {
    await service.charge.markAsFailed(...args, paypalPayment.reason_code);
  }

  const updatedCharge = await service.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);
  return chargeResponse(updatedCharge, { owner: updatedCharge.owner }, { paypal: { payer: paypalPayment.payer } });
}

const actionWrapper = lockWrapper(paypalReturnAction, 'tx!paypal:return', 'query.paymentId');

actionWrapper.transports = [ActionTransport.amqp, ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = actionWrapper;
