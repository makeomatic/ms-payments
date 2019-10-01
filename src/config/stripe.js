module.exports = {
  stripe: {
    enabled: false,
    secretKey: null,
    publicKey: null,
    client: {
      retry: {
        interval: 500,
        backoff: 500,
        max_interval: 5000,
        timeout: 5000,
        max_tries: 10,
        throw_original: true,
        predicate: { code: 429 },
      },
      apiVersion: '2019-09-09',
    },
    consts: {
      METADATA_FIELD_CUSTOMER_ID: 'stripeInternalCustomerId',
      METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID: 'stripeDefaultPaymentMethodId',
    },
  },
};
