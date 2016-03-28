const Promise = require('bluebird');
const MService = require('mservice');
const path = require('path');
const fsort = require('redis-filtered-sort');
const merge = require('lodash/merge');

const createPlan = require('./actions/plan/create');
const syncSaleTransactions = require('./actions/sale/sync.js');
const syncAgreements = require('./actions/agreement/sync.js');

/**
 * Class representing payments handling
 * @extends MService
 */
class Payments extends MService {

  /**
   * Configuration options for the service
   * @type {Object}
   */
  static defaultOpts = {
    logger: process.env.NODE_ENV === 'development',
    plugins: ['logger', 'validator', 'amqp', 'redisCluster'],
    amqp: {
      queue: 'ms-payments',
      initRoutes: true,
      initRouter: true,
      prefix: 'payments',
      postfix: path.join(__dirname, 'actions'),
    },
    mailer: {
      prefix: 'mailer',
      routes: {
        adhoc: 'adhoc',
        predefined: 'predefined',
      },
    },
    redis: {
      options: {
        keyPrefix: '{ms-payments}',
      },
    },
    paypal: {
      mode: 'sandbox',
      client_id: 'AdwVgBbIvVaPnlauY91S1-ifPMiQ1R2ZFiq7O6biwc60lcJTpdq9O_o-aFSfHTH9Bt2ly34s1lrQ-Dod',
      client_secret: 'EH0QpMk8BeZRuEumPZ4l2McyYAz66jXDS64bVFJL9d2mT1pJyMOP-dx3jN1yuvcKV_c6U8AaLCkSYptu', //eslint-disable-line
    },
    validator: ['../schemas'],
    users: {
      audience: '*.localhost',
      prefix: 'users',
      postfix: {
        updateMetadata: 'updateMetadata',
        getMetadata: 'getMetadata',
        list: 'list',
      },
    },
    defaultPlans: [{
      id: 'free',
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
    }],
    urls: {
      plan_return: 'http://api-sandbox.cappasity.matic.ninja/paypal-subscription-return',
      plan_cancel: 'http://api-sandbox.cappasity.matic.ninja/paypal-subscription-cancel',
      plan_notify: 'http://api-sandbox.cappasity.matic.ninja/paypal-subscription-notify',
      sale_return: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-return',
      sale_cancel: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-cancel',
      sale_notify: 'http://api-sandbox.cappasity.matic.ninja/paypal-sale-notify',
    },
    cart: {
      emailAccount: 'test@test.com',
      template: 'cart',
      from: '',
      to: '',
      subject: '',
    },
  };

  /**
   * Create Payments instance
   * @param  {Object} opts
   * @return {Payments}
   */
  constructor(opts = {}) {
    super(merge({}, Payments.defaultOpts, opts));

    this.on('plugin:connect:redisCluster', (redis) => {
      fsort.attach(redis, 'fsort');
    });
  }

  /**
   * Initialize default plans
   */
  initPlans() {
    this.log.info('Creating plans');
    const { defaultPlans } = this.config;
    return Promise
    .bind(this, defaultPlans)
    .map(plan => createPlan.call(this, plan).reflect())
    .map(function iterateOverPlans(plan) {
      if (plan.isFulfilled()) {
        this.log.info('Created plan %s', plan.value().name);
        return;
      }

      const err = plan.reason();
      if (err.status !== 409) {
        this.log.error('Error creating plan', err.stack);
      } else {
        this.log.warn(err.message);
      }
    });
  }

  syncTransactions() {
    this.log.info('syncing possibly missed transactions');

    // init sales sync
    syncSaleTransactions.call(this)
      .then(() => {
        this.log.info('completed sync of missing transactions');
      })
      .catch(err => {
        this.log.error('failed to sync sale transactions', err.stack);
      });

    syncAgreements.call(this, {})
      .then(() => {
        this.log.info('completed sync of agreements');
      })
      .catch(err => {
        this.log.error('failed to sync recurring transactions', err.stack);
      });

    return null;
  }

}

module.exports = Payments;
