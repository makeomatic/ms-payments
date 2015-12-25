module.exports.billingPlanBase = {
  alias: 'basic',
  hidden: false,
  plan: {
    name: 'basic',
    description: 'Basic plan',
    type: 'infinite',
    state: 'active',
    payment_definitions: [{
      name: 'monthly',
      type: 'regular',
      frequency: 'month',
      frequency_interval: '1',
      cycles: '0',
      amount: {
        currency: 'USD',
        value: '49.99',
      },
    }, {
      name: 'yearly',
      type: 'regular',
      frequency: 'year',
      frequency_interval: '1',
      cycles: '0',
      amount: {
        currency: 'USD',
        value: '499.99',
      },
    }],
    merchant_preferences: {
      return_url: 'https://someurl.com/return',
      cancel_url: 'https://someurl.com/cancel',
    },
  },
  subscriptions: [{
    name: 'monthly', // must be equal to payment_definitions name,
    models: 20,
    price: 5,
  }, {
    name: 'yearly', // must be equal to payment_definitions name,
    models: 240,
    price: 5,
  }],
};

module.exports.billingAgreementAttributes = {
  'name': 'Fast Speed Agreement',
  'description': 'Agreement for Fast Speed Plan',
  'start_date': '2016-12-01T00:37:04Z',
  'plan': {'id': 'P-12U98928TT9129128ECALAJY'},
  'payer': {'payment_method': 'paypal'},
  'shipping_address': {
    'line1': 'StayBr111idge Suites',
    'line2': 'Cro12ok Street',
    'city': 'San Jose',
    'state': 'CA',
    'postal_code': '95112',
    'country_code': 'US',
  },
};
