const { strictEqual } = require('assert');
const { ActionTransport } = require('@microfleet/core');
const { LockAcquisitionError } = require('ioredis-lock');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const omit = require('lodash/omit');

const acquireLock = require('../../../utils/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { CHARGE_SOURCE_STRIPE } = require('../../../utils/charge');
const { charge: chargeResponse } = require('../../../utils/json-api');

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
  const stripeChargeParams = { amount, description, statementDescriptor, metadata };

  if (email !== undefined) {
    stripeChargeParams.receipt_email = email;
  }

  try {
    await service.stripe.charge(charge.id, { ...source, ...stripeChargeParams });
  } catch (error) {
    service.log.error(`Stripe charge for ${charge.owner} is failed`, error, charge);
  }
}

async function createStripeChargeAction(service, request) {
  strictEqual(service.config.stripe.enabled, true, notEnabled);

  const { id: ownerId } = request.auth.credentials;
  const { audience } = service.config.users;
  const { alias } = request.auth.credentials.metadata[audience];
  // use owner id instead of alias
  const params = { owner: ownerId, ...request.params };
  const { owner, amount, description } = params;
  // next method should call first because it's validate source
  const stripeChargeSource = await selectChargeSource(service, params);
  // next method create internal record about charge
  const charge = await service.charge.create(CHARGE_SOURCE_STRIPE, owner, amount, description, omit(params, ['token']));

  // note it's not throw any errors
  await createStripeCharge(service, charge, stripeChargeSource, params);

  return chargeResponse(charge, { owner: alias });
}

async function wrappedAction(request) {
  const { id: ownerId } = request.auth.credentials;

  return Promise
    .using(this, request, acquireLock(this, `tx!charge:create:stripe:${ownerId}`), createStripeChargeAction)
    .catchThrow(LockAcquisitionError, concurrentRequests);
}

wrappedAction.auth = 'token';
wrappedAction.transports = [ActionTransport.http];
wrappedAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = wrappedAction;
