const path = require('path');
const { FREE_PLAN_ID } = require('../constants');

/**
 * Required Unique Service Name
 */
exports.name = 'ms-payments';

/**
 * Set to true if you want debug options
 * @type {boolean}
 */
exports.debug = process.env.NODE_ENV !== 'production';

/**
 * Logger plugin configuration.
 * @type {Object}
 */
exports.logger = {
  defaultLogger: true,
  debug: process.env.NODE_ENV !== 'production',
};

/**
 * Enabled Plugins
 * @type {Array}
 */
exports.plugins = [
  'logger',
  'validator',
  'router',
  'amqp',
  'redisCluster',
  'http',
  'prometheus',
];

exports.mailer = {
  prefix: 'mailer',
  routes: {
    adhoc: 'adhoc',
    predefined: 'predefined',
  },
};

/**
 * PayPal Configuration
 * @type {Object}
 */
exports.paypal = {
  mode: 'sandbox',
  client_id: 'AdwVgBbIvVaPnlauY91S1-ifPMiQ1R2ZFiq7O6biwc60lcJTpdq9O_o-aFSfHTH9Bt2ly34s1lrQ-Dod',
  client_secret: 'EKO6YQ7VC_56ero33GRm8pz9ZYXGX2uPc6E8QxV7FgiJVq3t_EmPdthONsjN_jRj0Cbi8lYQxv9leZXk',
};

/**
 * Validator Plugin Configuration
 * @type {Array}
 */
exports.validator = {
  schemas: [path.resolve(__dirname, '../../schemas')],
  ajv: {
    $meta: 'ms-validation AJV schema validator options',
  },
};

/**
 * Plans that are initialized during startup of the service.
 * @type {Array}
 */
exports.defaultPlans = [{
  id: FREE_PLAN_ID,
  alias: FREE_PLAN_ID,
  hidden: false,
  plan: {
    name: FREE_PLAN_ID,
    description: 'Default free plan',
    type: 'infinite',
    state: 'active',
    payment_definitions: [{
      name: FREE_PLAN_ID,
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
}];

/**
 * Custom Sale Notification Settings.
 * @type {Object}
 */
exports.cart = {
  emailAccount: 'test@test.com',
  template: 'cart',
  from: '',
  to: '',
  subject: '',
};
