const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');

const { LOCK_STRIPE_DEFAULT_PAYMENT_METHOD } = require('../../../constants');
const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const { deletedResponse } = require('../../../utils/json-api/payment-method-stripe-card');

const getId = (data) => data.id;

async function deletePaymentMethodsAction(request) {
  const { stripe, users } = this;
  const { customers, paymentMethods } = stripe;
  const { id: userId } = request.auth.credentials;
  const { id: paymentMethodId } = request.params;

  stripe.assertIsEnabled();

  const {
    [customers.METADATA_FIELD_CUSTOMER_ID]: customerId = null,
    [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID]: defaultPaymentMethodId = null,
  } = await users.getMetadata(userId, users.paymentAudience, { public: false });

  const paymentMethod = await paymentMethods.internalGet(paymentMethodId);

  if (paymentMethod === null) {
    throw new HttpStatusError(404, `Payment method #${paymentMethodId} not found`);
  }

  const meta = { [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID]: defaultPaymentMethodId };

  // it's more important to unset a default payment method than to delete a payment method
  if (paymentMethodId === defaultPaymentMethodId) {
    const paymentMethodsList = await paymentMethods.internalGetAll(customerId);
    const [newPaymentMethodId] = await paymentMethodsList.map(getId).filter((id) => id !== paymentMethodId);

    if (newPaymentMethodId !== undefined) {
      meta[paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID] = newPaymentMethodId;

      await users.setMetadata(userId, users.paymentAudience, { $set: meta });
    } else {
      meta[paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID] = null;

      await users.setMetadata(userId, users.paymentAudience, {
        $remove: [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID],
      });
    }
  }

  await paymentMethods.delete(customerId, paymentMethodId);

  return deletedResponse(paymentMethodId, meta);
}

const actionWrapper = lockWrapper(deletePaymentMethodsAction, ...LOCK_STRIPE_DEFAULT_PAYMENT_METHOD);

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
