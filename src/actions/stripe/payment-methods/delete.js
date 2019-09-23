const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');

const { LOCK_EDIT_PAYMENT_METHOD } = require('../../../constants');
const actionLockWrapper = require('../../../utils/action/acquire-lock');
const { deletedResponse } = require('../../../utils/json-api/payment-method-stripe-card');
const { PAYMENT_METHOD_CARD, getCustomerIdFromPaymentsMeta } = require('../../../utils/stripe');

const mapInternalId = (data) => data.internalId;

function getUpdatedPaymentMethod(internalPaymentMethodId, paymentMethodIds, metadata) {
  const { defaultPaymentMethodType = null, defaultPaymentMethodId = null } = metadata;
  const updatedMetada = { defaultPaymentMethodType: null, defaultPaymentMethodId: null };

  if (defaultPaymentMethodType === PAYMENT_METHOD_CARD && defaultPaymentMethodId === internalPaymentMethodId) {
    const availablePaymentMethodIds = paymentMethodIds.filter((id) => id !== internalPaymentMethodId);

    if (availablePaymentMethodIds.length !== 0) {
      updatedMetada.defaultPaymentMethodType = PAYMENT_METHOD_CARD;
      [updatedMetada.defaultPaymentMethodId] = availablePaymentMethodIds;
    }
  }

  return updatedMetada;
}

async function deletePaymentMethodsAction(request) {
  const { stripe, users } = this;
  const { id: userId } = request.auth.credentials;
  const { id: internalPaymentMethodId } = request.params;

  stripe.assertIsEnabled();

  const metadata = await users.getMetadata(userId, users.paymentAudience, { public: false });
  const internalStripeCustomerId = getCustomerIdFromPaymentsMeta(metadata, { assertNotNull: true });
  const paymentMethods = await stripe.internalGetPaymentMethods(internalStripeCustomerId);
  const paymentMethodIds = paymentMethods.map(mapInternalId);

  if (paymentMethodIds.includes(internalPaymentMethodId) === false) {
    throw new HttpStatusError(404, `Payment method #${internalPaymentMethodId} not found`);
  }

  const updatedPaymentMethod = getUpdatedPaymentMethod(internalPaymentMethodId, paymentMethodIds, metadata);

  // it's more important to unset a default payment method than to delete a payment method
  if (updatedPaymentMethod.defaultPaymentMethodType === null) {
    await users.setMetadata(userId, users.paymentAudience, { $unset: ['defaultPaymentMethodType', 'defaultPaymentMethodId'] });
  } else {
    await users.setMetadata(userId, users.paymentAudience, { $set: updatedPaymentMethod });
  }

  await stripe.deletePaymentMethod(internalStripeCustomerId, internalPaymentMethodId);

  return deletedResponse(internalPaymentMethodId, updatedPaymentMethod);
}

const actionWrapper = actionLockWrapper(deletePaymentMethodsAction, LOCK_EDIT_PAYMENT_METHOD, 'auth.credentials.id');

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
