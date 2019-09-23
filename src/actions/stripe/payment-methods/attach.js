const { ActionTransport } = require('@microfleet/core');

const { LOCK_EDIT_PAYMENT_METHOD } = require('../../../constants');
const actionLockWrapper = require('../../../utils/action/acquire-lock');
const { modelResponse } = require('../../../utils/json-api/payment-method-stripe-card');
const { PAYMENT_METHOD_CARD, getCustomerIdFromPaymentsMeta } = require('../../../utils/stripe');

async function attachPaymentMethodsAction(request) {
  const { stripe, users } = this;

  stripe.assertIsEnabled();

  const { id: userId } = request.auth.credentials;
  const { paymentMethod, useAsDefault } = request.params;
  const metadata = await users.getMetadata(userId, users.paymentAudience, { public: false });
  const internalStripeCustomerId = getCustomerIdFromPaymentsMeta(metadata, { assertNotNull: true });
  const { defaultPaymentMethodType = null } = metadata;

  const internalPaymentMethod = await this.stripe.attachPaymentMethod(paymentMethod, internalStripeCustomerId);

  if (useAsDefault === true || defaultPaymentMethodType === null) {
    await users.setMetadata(userId, users.paymentAudience, {
      $set: { defaultPaymentMethodType: PAYMENT_METHOD_CARD, defaultPaymentMethodId: internalPaymentMethod.internalId },
    });
  }

  return modelResponse(internalPaymentMethod);
}

const actionWrapper = actionLockWrapper(attachPaymentMethodsAction, LOCK_EDIT_PAYMENT_METHOD, 'auth.credentials.id');

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
