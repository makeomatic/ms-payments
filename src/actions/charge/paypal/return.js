const { ActionTransport } = require('@microfleet/core');
const { HttpStatusError } = require('common-errors');
const assert = require('assert');

const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_INITIALIZED } = require('../../../utils/charge');
const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../../utils/json-api');

const alreadyExecutedError = new HttpStatusError(400, 'already executed');

async function paypalReturnAction(request) {
  const { paymentId, PayerID: payerId } = request.method === 'amqp' ? request.params : request.query;
  const chargeId = await this.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);
  const charge = await this.charge.get(chargeId);
  assert.equal(charge.status, STATUS_INITIALIZED, alreadyExecutedError);

  const paypalPayment = await this.paypal.execute(paymentId, payerId);
  this.log.info({ paypalPayment }, 'authorized payment');

  // ensure we have an authorize and not an immediate sale
  assert.equal(paypalPayment.intent, 'authorize');

  const args = [chargeId, paymentId, paypalPayment];
  if (paypalPayment.state.toLowerCase() === 'approved') {
    await this.charge.markAsAuthorized(...args);
  } else {
    await this.charge.markAsFailed(...args, paypalPayment.reason_code);
  }

  const updatedCharge = await this.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);
  return chargeResponse(updatedCharge, { owner: updatedCharge.owner }, { paypal: { payer: paypalPayment.payer } });
}

const actionWrapper = lockWrapper(
  paypalReturnAction,
  'tx!paypal:return',
  (request) => (request.method === 'amqp' ? request.params.paymentId : request.query.paymentId)
);

actionWrapper.transports = [ActionTransport.amqp, ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = actionWrapper;
