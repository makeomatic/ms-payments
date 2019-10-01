const { ActionTransport } = require('@microfleet/core');

const { collectionResponse } = require('../../../utils/json-api/payment-method-stripe-card');

async function paymentMethodsListAction(request) {
  const { stripe, users } = this;
  const { customers, paymentMethods } = stripe;
  const { id: userId } = request.auth.credentials;

  stripe.assertIsEnabled();

  const {
    [customers.METADATA_FIELD_CUSTOMER_ID]: customerId = null,
    [paymentMethods.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID]: defaultPaymentMethodId = null,
  } = await users.getMetadata(userId, users.paymentAudience, { public: false });

  if (customerId === null) {
    return collectionResponse([]);
  }

  const paymentMethodsList = await paymentMethods.internalGetAll(customerId);

  return collectionResponse(paymentMethodsList, { defaultPaymentMethodId });
}

paymentMethodsListAction.auth = 'token';
paymentMethodsListAction.transports = [ActionTransport.http];
paymentMethodsListAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = paymentMethodsListAction;
