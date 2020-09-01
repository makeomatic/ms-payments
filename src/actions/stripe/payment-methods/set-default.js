const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');

const { LOCK_STRIPE_DEFAULT_PAYMENT_METHOD } = require('../../../constants');
const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const { updateDefaultMethodResponse } = require('../../../utils/json-api/payment-method-stripe-card');

async function setDefaultPaymentMethodAction(request) {
  const { stripe, users } = this;
  const { paymentMethods } = stripe;
  const { id: userId } = request.auth.credentials;
  const { id: paymentMethodId } = request.params;

  stripe.assertIsEnabled();

  const {
    [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID]: defaultPaymentMethodId = null,
  } = await users.getMetadata(userId, users.paymentAudience, { public: false });

  if (paymentMethodId === defaultPaymentMethodId) {
    return updateDefaultMethodResponse(false, paymentMethodId);
  }

  const paymentMethod = await paymentMethods.internalGet(paymentMethodId);

  if (paymentMethod === null) {
    throw new HttpStatusError(404, `Payment method #${paymentMethodId} not found`);
  }

  await users.setMetadata(userId, users.paymentAudience, {
    $set: { [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID]: paymentMethodId },
  });

  return updateDefaultMethodResponse(true, paymentMethodId);
}

const actionWrapper = lockWrapper(setDefaultPaymentMethodAction, ...LOCK_STRIPE_DEFAULT_PAYMENT_METHOD);

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
