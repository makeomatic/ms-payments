const ld = require('lodash');
const paypal = require('paypal-rest-sdk');
const bunyan = require('bunyan');
const MService = require('mservice');
const path = require('path');
const fs = require('fs');
const sortedFilteredListLua = fs.readFileSync(path.resolve(__dirname, '../lua/sorted-filtered-list.lua'), 'utf-8');

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
    }
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
}

module.exports = Payments;
