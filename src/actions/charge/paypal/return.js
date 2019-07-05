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

async function paypalReturnAction(service, request) {
  const { paymentId, PayerID: payerId } = request.method === 'amqp' ? request.params : request.query;
  const chargeId = await service.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);

  const charge = await service.charge.get(chargeId);

  if (charge.status !== STATUS_INITIALIZED) {
    throw alreadyExecutedError;
  }

  const paypalPayment = await service.paypal.execute(paymentId, payerId);

  if (paypalPayment.state === 'approved') {
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
    await this.charge.markAsFailed(chargeId, paypalPayment.id, paypalPayment);
  }

  if (request.method === 'amqp') {
    const updatedCharge = await this.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);

    return chargeResponse(updatedCharge);
  }

  return { received: true };
}

async function wrappedAction(request) {
  return Promise
    .using(this, request, acquireLock(
      this, `tx!paypal:return:${request.query.PayerID}:${request.query.paymentId}`
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
