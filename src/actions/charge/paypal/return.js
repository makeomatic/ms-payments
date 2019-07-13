const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const assert = require('assert');

const acquireLock = require('../../../utils/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_INITIALIZED } = require('../../../utils/charge');
const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../../utils/json-api');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');
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

async function wrappedAction(request) {
  return Promise
    .using(this, request, acquireLock(
      this, `tx!paypal:return:${request.query.paymentId}`
    ), paypalReturnAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.transports = [ActionTransport.amqp, ActionTransport.http];
wrappedAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = wrappedAction;
