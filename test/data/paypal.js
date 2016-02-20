module.exports.testPlanData = {
  alias: 'basic',
  hidden: false,
  plan: {
    name: 'basic',
    description: 'Basic plan',
    type: 'infinite',
    state: 'active',
    payment_definitions: [{
      name: 'month',
      type: 'regular',
      frequency: 'month',
      frequency_interval: '1',
      cycles: '0',
      amount: {
        currency: 'USD',
        value: '49.99',
      },
    }, {
      name: 'year',
      type: 'regular',
      frequency: 'year',
      frequency_interval: '1',
      cycles: '0',
      amount: {
        currency: 'USD',
        value: '499.99',
      },
    }],
  },
  subscriptions: [{
    name: 'month', // must be equal to payment_definitions frequency,
    models: 20,
    price: 5,
  }, {
    name: 'year', // must be equal to payment_definitions frequency,
    models: 240,
    price: 5,
  }],
};

module.exports.freePlanData = {
  alias: 'free',
  hidden: false,
  plan: {
    name: 'free',
    description: 'Default free plan',
    type: 'infinite',
    state: 'active',
    payment_definitions: [{
      name: 'free',
      type: 'regular',
      frequency: 'month',
      frequency_interval: '1',
      cycles: '0',
      amount: {
        currency: 'USD',
        value: '0',
      },
    }],
  },
  subscriptions: [{
    name: 'month', // must be equal to payment_definitions frequency,
    models: 100,
    price: 0.5,
  }],
};

module.exports.testAgreementData = {
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

module.exports.testSaleData = {
  'owner': 'test@test.ru',
  'amount': 10,
};

module.exports.testDynamicSaleData = {
  'owner': 'test@test.ru',
  'amount': 10,
  'type': 2,
};
