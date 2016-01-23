const Promise = require('bluebird');
const MService = require('mservice');
const path = require('path');
const fsort = require('redis-filtered-sort');
const merge = require('lodash/merge');

const createPlan = require('./actions/plan/create');
const statePlan = require('./actions/plan/state');
const syncSaleTransactions = require('./actions/sale/sync.js');

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
    redis: {
      options: {
        keyPrefix: '{ms-payments}',
      },
    },
    paypal: {
      mode: 'sandbox',
      client_id: 'ASfLM0CKCfS1qAA5OhyGAQ7kneCBvvkpVkphYITmbnCXwqBCrGO1IDk6k842YnbRBVoWp3fqzJe4FaNx',
      client_secret: 'EOu4zIgcRwNACG3XMQTUHiwZtc4lDfhO8xlKyK5t1_XBiJl8adpam88GoujJMhIRm9lsTfBdQ1IgCPYv', //eslint-disable-line
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
    return Promise.map(defaultPlans, plan => { // eslint-disable-line arrow-body-style
      return createPlan
        .call(this, plan)
        .then(newPlan => {
          if (newPlan.id === 'free') {
            return newPlan;
          }

          return statePlan.call(this, { id: newPlan.id, state: 'active' }).return(newPlan);
        })
        .reflect();
    })
    .bind(this)
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

    return null;
  }

}

module.exports = Payments;
