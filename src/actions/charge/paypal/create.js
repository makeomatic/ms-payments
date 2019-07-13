const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');

const { handlePipeline } = require('../../../utils/redis');
const acquireLock = require('../../../utils/acquire-lock');
const { CHARGE_SOURCE_PAYPAL } = require('../../../utils/charge');
const { charge: chargeResponse } = require('../../../utils/json-api');

const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');

async function createPaypalChargeAction(service, request) {
  const { id: ownerId } = request.auth.credentials;
  const { audience } = service.config.users;
  const { alias } = request.auth.credentials.metadata[audience];

  // use owner id instead of alias
  const params = Object.assign({ owner: ownerId }, request.params);
  const { amount, description, owner, returnUrl, cancelUrl } = params;

  // create internal record
  const charge = await service.charge.create(CHARGE_SOURCE_PAYPAL, owner, amount, description, params);
  const chargeId = charge.id;

  // create paypal payment
  const paypalPayment = await service.paypal
    .createPayment(chargeId, { amount, description, returnUrl, cancelUrl });
  const approvalUrl = paypalPayment.links.find(link => link.rel === 'approval_url');
  const sourceId = paypalPayment.id;

  const pipeline = service.redis.pipeline();
  await service.paypal.setInternalId(sourceId, chargeId, pipeline);
  await service.charge.updateSource({ id: chargeId, sourceId, sourceMetadata: paypalPayment }, pipeline);
  await pipeline.exec().then(handlePipeline);

  return chargeResponse(charge, { owner: alias }, { paypal: { approvalUrl, paymentId: sourceId } });
}

async function wrappedAction(request) {
  const { id: ownerId } = request.auth.credentials;

  return Promise
    .using(this, request, acquireLock(this, `tx!charge:create:paypal:${ownerId}`), createPaypalChargeAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.auth = 'token';
wrappedAction.transports = [ActionTransport.amqp, ActionTransport.http];
wrappedAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = wrappedAction;
