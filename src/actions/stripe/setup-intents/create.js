const { ActionTransport } = require('@microfleet/core');

const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const { modelResponse } = require('../../../utils/json-api/stripe-payment-intent');

async function stripeSetupIntentCreateAction(request) {
  const { stripe } = this;
  const { intents, customers } = stripe;
  const { id: userId } = request.auth.credentials;

  stripe.assertIsEnabled();

  const customer = await customers.setupCustomerForUserId(userId);
  const intent = await intents.setup(customer.stripeId);

  return modelResponse(intent);
}

const actionWrapper = lockWrapper(stripeSetupIntentCreateAction, 'tx!stripe:setup:intents', 'auth.credentials.id');

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
