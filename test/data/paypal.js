const moment = require('moment');

exports.testPlanData = {
  alias: 'basic',
  title: 'Premium',
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
  meta: {
    storage: {
      description: 'file storage limits',
      type: 'number',
      value: 10,
    },
  },
  // @todo remove as it is a userland-specific field
  level: 30,
};

exports.freePlanData = {
  alias: 'free',
  title: 'Free',
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
  meta: {
    storage: {
      description: 'file storage limits',
      type: 'number',
      value: 0.5,
    },
  },
  // @todo remove as it is a userland-specific field
  level: 0,
};

exports.testAgreementData = {
  name: 'Fast Speed Agreement',
  description: 'Agreement for Fast Speed Plan',
  start_date: moment().add(1, 'month').format('YYYY-MM-DD[T]HH:mm:ss[Z]'),
  plan: {
    id: 'P-12U98928TT9129128ECALAJY',
  },
  payer: {
    payment_method: 'paypal',
  },
  shipping_address: {
    line1: 'StayBr111idge Suites',
    line2: 'Cro12ok Street',
    city: 'San Jose',
    state: 'CA',
    postal_code: '95112',
    country_code: 'US',
  },
};

exports.testSaleData = {
  owner: 'test@test.ru',
  amount: 10,
};

exports.testDynamicSaleData = {
  owner: 'test@test.ru',
  amount: 10,
  type: 2,
  cart: {
    id: 'test-cart-id',
    shipping_type: 'delivery',
    shipping_price: 13.99,
    printing_price: 25.99,
    service_price: 3.99,
    user_price: 55.90,
  },
};
