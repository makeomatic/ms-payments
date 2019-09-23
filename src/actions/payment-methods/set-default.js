const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');

const { LOCK_EDIT_PAYMENT_METHOD } = require('../../constants');
const actionLockWrapper = require('../../utils/action/acquire-lock');
const { updateDefaultMethodResponse } = require('../../utils/json-api/payment-method-stripe-card');
const { PAYMENT_METHOD_CARD, getCustomerIdFromPaymentsMeta } = require('../../utils/stripe');

const mapInternalId = (data) => data.internalId;

async function setDefaultPaymentMethodAction(request) {
  const { stripe, users } = this;
  const { id: userId } = request.auth.credentials;
  const { id: internalPaymentMethodId, type: internalPaymentMethodType } = request.params;
  const metadata = await users.getMetadata(userId, users.paymentAudience, { public: false });
  const { defaultPaymentMethodType = null, defaultPaymentMethodId = null } = metadata;
  const updatedPaymentMethod = {
    defaultPaymentMethodType: internalPaymentMethodType,
    defaultPaymentMethodId: internalPaymentMethodId };

  if (internalPaymentMethodType === PAYMENT_METHOD_CARD) {
    stripe.assertIsEnabled();

    const internalStripeCustomerId = getCustomerIdFromPaymentsMeta(metadata, { assertNotNull: true });
    const paymentMethods = await stripe.internalGetPaymentMethods(internalStripeCustomerId);
    const paymentMethodIds = paymentMethods.map(mapInternalId);

    if (paymentMethodIds.includes(internalPaymentMethodId) === false) {
      throw new HttpStatusError(404, `Payment method #${internalPaymentMethodId} not found`);
    }

    if (defaultPaymentMethodId === internalPaymentMethodId && defaultPaymentMethodType === internalPaymentMethodType) {
      return updateDefaultMethodResponse(false, internalPaymentMethodId, updatedPaymentMethod);
    }

    await users.setMetadata(userId, users.paymentAudience, { $set: updatedPaymentMethod });

    return updateDefaultMethodResponse(true, internalPaymentMethodId, updatedPaymentMethod);
  }

  throw new HttpStatusError(412, `Payment method type #${internalPaymentMethodType} is unkonown`);
}

const actionWrapper = actionLockWrapper(setDefaultPaymentMethodAction, LOCK_EDIT_PAYMENT_METHOD, 'auth.credentials.id');

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
