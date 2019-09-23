const { ActionTransport } = require('@microfleet/core');

const actionLockWrapper = require('../../../utils/action/acquire-lock');
const { modelResponse } = require('../../../utils/json-api/stripe-payment-intent');

async function stripeSetupIntentCreateAction(request) {
  const { stripe } = this;

  stripe.assertIsEnabled();

  const { id: userId } = request.auth.credentials;
  const internalCustomer = await stripe.setupCustomerForUserId(userId);
  const intent = await stripe.setupIntents(internalCustomer.stripeId);

  return modelResponse(intent);
}

const actionWrapper = actionLockWrapper(stripeSetupIntentCreateAction, 'tx!stripe:setup:intents', 'auth.credentials.id');

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
