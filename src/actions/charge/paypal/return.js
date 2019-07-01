const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');

const acquireLock = require('../../../utils/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_INITIALIZED } = require('../../../utils/charge');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');
const alreadyExecutedError = new HttpStatusError(400, 'already executed');

async function paypalReturnAction(service, request) {
  const { paymentId, PayerID: payerId } = request.query;
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
    await service.balance.increment(charge.owner, Number(charge.amount), pipeline);
    await pipeline.exec();
  } else {
    await this.charge.markAsFailed(chargeId, paypalPayment.id, paypalPayment);
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

wrappedAction.transports = [ActionTransport.http];
wrappedAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = wrappedAction;
