const { strictEqual } = require('assert');
const { ActionTransport } = require('@microfleet/core');
const { HttpStatusError } = require('common-errors');

const { LOCK_STRIPE_DEFAULT_PAYMENT_METHOD } = require('../../../constants');
const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const { modelResponse } = require('../../../utils/json-api/payment-method-stripe-card');

const customerNotFound = new HttpStatusError(412, 'Create setup intent first');

async function attachPaymentMethodsAction(request) {
  const { stripe, users } = this;
  const { customers, paymentMethods } = stripe;
  const { id: userId } = request.auth.credentials;
  const { paymentMethod: paymentMethodToken, useAsDefault } = request.params;

  stripe.assertIsEnabled();

  const {
    [customers.METADATA_FIELD_CUSTOMER_ID]: customerId = null,
    [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID]: defaultPaymentMethodId = null,
  } = await users.getMetadata(userId, users.paymentAudience, { public: false });

  strictEqual(customerId !== null, true, customerNotFound);

  const paymentMethod = await paymentMethods.attach(paymentMethodToken, customerId);

  if (useAsDefault === true || defaultPaymentMethodId === null) {
    await users.setMetadata(userId, users.paymentAudience, {
      $set: { [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID]: paymentMethod.id },
    });
  }

  return modelResponse(paymentMethod);
}

const actionWrapper = lockWrapper(attachPaymentMethodsAction, ...LOCK_STRIPE_DEFAULT_PAYMENT_METHOD);

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
