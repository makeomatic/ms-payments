const { strictEqual } = require('assert');
const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const omit = require('lodash/omit');

const acquireLock = require('../../../utils/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { CHARGE_SOURCE_STRIPE } = require('../../../utils/stripe');

const notEnabled = new HttpStatusError(501, 'Stripe is not enabled');
const concurrentRequests = new HttpStatusError(429, 'multiple concurrent requests');
const tokenIsRequired = new HttpStatusError(400, 'Stripe token is required');

async function selectChargeSource(service, params) {
  const { owner, token, saveCard, email } = params;
  const storedCustomer = await service.stripe.storedCustomer(owner);

  // stripe token is required if customer not found
  if (storedCustomer === null) {
    assertStringNotEmpty(token, 'token', tokenIsRequired);
  }

  if (saveCard === false) {
    return storedCustomer === null ? { source: token } : { customer: storedCustomer.id };
  }

  const customer = storedCustomer === null
    ? await service.stripe.createCustomer(owner, { source: token, email })
    : await service.stripe.updateCustomer(owner, storedCustomer.id, { source: token, email });

  return { customer: customer.id };
}

async function createStripeCharge(service, charge, source, params) {
  const { amount, description, statementDescriptor, metadata, email } = params;
  const stripeMetadata = Object.assign({ internalId: charge.id }, metadata);
  const stripeChargeParams = { amount, description, statementDescriptor, metadata: stripeMetadata };

  if (email !== undefined) {
    stripeChargeParams.receipt_email = email;
  }

  try {
    return service.stripe.charge(Object.assign({}, source, stripeChargeParams));
  } catch (error) {
    service.log.error(error, charge);
    await service.charge.markAsFailed(charge, error.message, error);

    throw error;
  }
}

async function incrementBalance(service, charge, stripeCharge) {
  try {
    const { owner, amount } = charge;
    const pipeline = service.redis.pipeline();

    await service.charge.markAsComplete(charge, stripeCharge.id, stripeCharge, pipeline);
    await service.balance.increment(owner, amount, pipeline);
    await pipeline.exec();
  } catch (error) {
    service.log.error(error, charge, stripeCharge);
    // @todo retry
  }
}

async function createStripeChargeAction(service, { params }) {
  strictEqual(service.config.stripe.enabled, true, notEnabled);

  const { owner, amount, description } = params;
  const stripeChargeSource = await selectChargeSource(service, params);
  // store info about charge
  const charge = await service.charge.create(CHARGE_SOURCE_STRIPE, owner, amount, description, omit(params, ['token']));
  const stripeCharge = await createStripeCharge(service, charge, stripeChargeSource, params);

  await incrementBalance(service, charge, stripeCharge);

  return { balance: await service.balance.get(owner) };
}

async function wrappedAction(request) {
  return Promise
    .using(this, request, acquireLock(this, `tx!${request.params.owner}`), createStripeChargeAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.transports = [ActionTransport.amqp];

module.exports = wrappedAction;
