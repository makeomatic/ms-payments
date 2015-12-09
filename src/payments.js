const ld = require('lodash');
const paypal = require('paypal-rest-sdk');
const bunyan = require('bunyan');
const MService = require('mservice');
const path = require('path');
const fs = require('fs');
const sortedFilteredListLua = fs.readFileSync(path.resolve(__dirname, '../lua/sorted-filtered-list.lua'), 'utf-8');

const createPlan = require('./actions/plan/create');
const Promise = require('bluebird');

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
    plugins: ['logger', 'amqp', 'redisCluster', 'validator'],
    amqp: {
      queue: 'ms-payments',
      initRoutes: true,
      initRouter: true,
      prefix: 'payments',
      postfix: path.join(__dirname, 'actions')
    },
    redis: {
      options: {
        keyPrefix: '{ms-payments}'
      }
    },
    paypal: {
      mode: "sandbox",
      client_id: "ASfLM0CKCfS1qAA5OhyGAQ7kneCBvvkpVkphYITmbnCXwqBCrGO1IDk6k842YnbRBVoWp3fqzJe4FaNx",
      client_secret: "EOu4zIgcRwNACG3XMQTUHiwZtc4lDfhO8xlKyK5t1_XBiJl8adpam88GoujJMhIRm9lsTfBdQ1IgCPYv"
    },
    validator: [__dirname + '/../schemas'],
    billing: {
      audience: 'billing',
    },
    users: {
      audience: '*.localhost',
      prefix: 'users',
      postfix: {
        updateMetadata: 'updateMetadata',
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
            value: '0'
          }
        }]
      },
      subscriptions: [{
        name: 'free', // must be equal to payment_definitions name,
        models: 100,
        price: 0.5
      }]
    }]
  };

  /**
   * Create Payments instance
   * @param  {Object} opts
   * @return {Payments}
   */
  constructor(opts = {}) {
    super(ld.merge({}, Payments.defaultOpts, opts));

    this.on('plugin:connect:redisCluster', (redis) => {
      redis.defineCommand('sortedFilteredPaymentsList', {
        numberOfKeys: 2,
        lua: sortedFilteredListLua,
      });
    });
  }

  /**
   * Initialize default plans
   */
  initPlans() {
    const { defaultPlans } = this.config;
    return Promise.map(defaultPlans, (plan) => {
      return createPlan.call(this, plan).reflect();
    })
    .bind(this)
    .then((plans) => {
      const messages = plans.map((plan) => {
        if (plan.isFulfilled()) {
          return `Created plan ${plan.value().name}`;
        } else {
          return `Error creating plan ${plan.reason()}`;
        }
      });

      this.log.info(messages);
    })
  }
}

module.exports = Payments;
