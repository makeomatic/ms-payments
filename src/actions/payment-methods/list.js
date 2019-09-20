const { ActionTransport } = require('@microfleet/core');

const { makeModel } = require('../../utils/json-api/payment-method-stripe-card');

async function paymentMethodsListAction(request) {
  const { stripe, users } = this;
  const collection = [];
  const { id: userId } = request.auth.credentials;
  const metadata = await users.getMetadata(userId, users.paymentAudience, { public: false });
  const { internalStripeCustomerId = null } = metadata;

  if (internalStripeCustomerId !== null && stripe.isEnabled() === true) {
    const stripePaymentMethods = await stripe
      .internalGetPaymentMethods(internalStripeCustomerId);

    collection.push(...stripePaymentMethods.map(makeModel));
  }

  const response = { data: collection };
  const { defaultPaymentMethodType = null, defaultPaymentMethodId = null } = metadata;

  if (defaultPaymentMethodType !== null) {
    response.meta = { defaultPaymentMethodType, defaultPaymentMethodId };
  }

  return response;
}

paymentMethodsListAction.auth = 'token';
paymentMethodsListAction.transports = [ActionTransport.http];
paymentMethodsListAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = paymentMethodsListAction;
