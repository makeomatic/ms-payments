const publishing = {
  retry: {
    enabled: false,
  },
};

exports.subscriptions = {
  events: {
    'paypal:agreements:execution:success': [],
    'paypal:agreements:execution:failure': [],
    'paypal:agreements:billing:success': {
      endpoint: 'ms-billing.paypal.agreements.billing.success',
      publishing,
    },
    'paypal:agreements:billing:failure': [{
      endpoint: 'ms-billing.paypal.agreements.billing.failure',
      publishing,
    }],
    'paypal:transactions:create': [],
  },
};
