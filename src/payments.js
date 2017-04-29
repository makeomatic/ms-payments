const Promise = require('bluebird');
const MService = require('mservice');
const path = require('path');
const fsort = require('redis-filtered-sort');
const merge = require('lodash/merge');
const Mailer = require('ms-mailer-client');
const routerExtension = require('mservice').routerExtension;

// plugins
const autoSchema = routerExtension('validate/schemaLessAction');
const auditLog = routerExtension('audit/log');

// internal actions
const createPlan = require('./actions/plan/create');
const syncSaleTransactions = require('./actions/sale/sync.js');
const syncAgreements = require('./actions/agreement/sync.js');

// constants
const { FREE_PLAN_ID } = require('./constants.js');

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
    debug: process.env.NODE_ENV !== 'production',
    logger: {
      defaultLogger: true,
      debug: process.env.NODE_ENV !== 'production',
    },
    plugins: ['logger', 'validator', 'router', 'amqp', 'redisCluster'],
    amqp: {
      transport: {
        queue: 'ms-payments',
      },
      router: {
        enabled: true,
      },
    },
    router: {
      routes: {
        directory: path.join(__dirname, 'actions'),
        prefix: 'payments',
        setTransportsAsDefault: true,
        transports: ['amqp'],
      },
      extensions: {
        enabled: ['postRequest', 'preRequest', 'preResponse'],
        register: [autoSchema, auditLog],
      },
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
        dropBufferSupport: false,
      },
    },
    paypal: {
      mode: 'sandbox',
      client_id: 'AdwVgBbIvVaPnlauY91S1-ifPMiQ1R2ZFiq7O6biwc60lcJTpdq9O_o-aFSfHTH9Bt2ly34s1lrQ-Dod',
      client_secret: 'EKO6YQ7VC_56ero33GRm8pz9ZYXGX2uPc6E8QxV7FgiJVq3t_EmPdthONsjN_jRj0Cbi8lYQxv9leZXk', //eslint-disable-line
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
        embeddings: 30,
        traffic: 2,
        storage: 0.5,
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

    this.on('plugin:connect:amqp', (amqp) => {
      this.mailer = new Mailer(amqp, this.config.mailer);
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
    .map(plan => createPlan.call(this, { params: plan }).reflect())
    .map(function iterateOverPlans(plan) {
      if (plan.isFulfilled()) {
        this.log.info('Created plan %s', plan.value().name);
        return null;
      }

      const err = plan.reason();
      if (err.status !== 409) {
        this.log.error('Error creating plan', err.stack);
      } else {
        this.log.warn(err.message);
      }

      return null;
    });
  }

  syncTransactions() {
    this.log.info('syncing possibly missed transactions');

    // init sales sync
    syncSaleTransactions.call(this, {})
      .then(() => {
        return this.log.info('completed sync of missing transactions');
      })
      .catch((err) => {
        this.log.error('failed to sync sale transactions', err.stack);
      });

    syncAgreements.call(this, {})
      .then(() => {
        return this.log.info('completed sync of agreements');
      })
      .catch((err) => {
        this.log.error('failed to sync recurring transactions', err.stack);
      });

    return null;
  }

}

module.exports = Payments;
