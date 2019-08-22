const Promise = require('bluebird');
const { Microfleet, ConnectorsTypes } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');
const merge = require('lodash/merge');
const Mailer = require('ms-mailer-client');
const RedisCluster = require('ioredis').Cluster;
const LockManager = require('dlock');

const conf = require('./conf');
// internal actions
const createPlan = require('./actions/plan/create');
const syncSaleTransactions = require('./actions/sale/sync');
const syncAgreements = require('./actions/agreement/sync');
const Balance = require('./utils/balance');
const Charge = require('./utils/charge');
const Stripe = require('./utils/stripe');
const Paypal = require('./utils/paypal-payment');

/**
 * Class representing payments handling
 * @extends MService
 */
class Payments extends Microfleet {
  /**
   * Create Payments instance
   * @param  {Object} opts
   * @return {Payments}
   */
  constructor(opts = {}) {
    super(merge({}, Payments.defaultOpts, opts));

    this.initRedis();
    this.initLockManager();

    this.on('plugin:connect:amqp', (amqp) => {
      this.mailer = new Mailer(amqp, this.config.mailer);
    });

    // add migration connector
    if (this.config.migrations.enabled === true) {
      this.addConnector(ConnectorsTypes.migration, () => (
        this.migrate('redis', `${__dirname}/migrations`)
      ));
    }

    this.addConnector(ConnectorsTypes.application, async () => {
      if (this.config.stripe.enabled === true) {
        this.stripe = new Stripe(this.config.stripe, this.redis);

        if (this.config.stripe.webhook.enabled === true) {
          if (process.env.NODE_ENV === 'test') {
            await this.stripe.dropHooks();
          }

          await this.stripe.setupWebhook();
        }
      }

      this.balance = new Balance(this.redis);
      this.charge = new Charge(this.redis);
      this.paypal = new Paypal({ urls: this.config.urls, ...this.config.charge.paypal }, this.redis);
    });

    // init plans and sync transactions during startup of production
    // service
    if (process.env.NODE_ENV === 'production') {
      this.addConnector(ConnectorsTypes.application, () => (
        Promise
          .bind(this)
          .then(this.initPlans)
          .then(this.syncTransactions)
      ));
    }
  }

  /**
   * Initialize default plans
   */
  initPlans() {
    this.log.info('Creating plans');
    const { defaultPlans } = this.config;
    return Promise
      .bind(this, defaultPlans)
      .map((plan) => createPlan.call(this, { params: plan }).reflect())
      .map(function iterateOverPlans(plan) {
        if (plan.isFulfilled()) {
          this.log.info('Created plan %s', plan.value().name);
          return null;
        }

        const err = plan.reason();
        if (err.status !== 409) {
          this.log.error({ err }, 'Error creating plan');
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
        this.log.error({ err }, 'failed to sync sale transactions');
      });

    syncAgreements.call(this, {})
      .then(() => {
        return this.log.info('completed sync of agreements');
      })
      .catch((err) => {
        this.log.error({ err }, 'failed to sync recurring transactions');
      });

    return null;
  }

  initRedis() {
    const { config } = this;

    if (config.plugins.includes('redisCluster')) {
      this.redisType = 'redisCluster';
      this.redisDuplicate = () => new RedisCluster(config.redis.hosts, { ...config.redis.options, lazyConnect: true });
    } else if (config.plugins.includes('redisSentinel')) {
      this.redisType = 'redisSentinel';
      this.redisDuplicate = (redis) => redis.duplicate();
    } else {
      throw new Error('must include redis family plugins');
    }

    this.on(`plugin:connect:${this.redisType}`, (redis) => {
      fsort.attach(redis, 'fsort');
    });
  }

  initLockManager() {
    this.addDestructor(ConnectorsTypes.database, () => this.dlock.pubsub.disconnect());

    this.on(`plugin:close:${this.redisType}`, () => {
      this.dlock = null;
    });

    this.addConnector(ConnectorsTypes.migration, async () => {
      this.pubsub = this.redisDuplicate(this.redis);

      await this.pubsub.connect();

      this.dlock = new LockManager({
        ...this.config.dlock,
        client: this.redis,
        pubsub: this.pubsub,
        log: this.log,
      });
    });
  }
}

/**
 * Configuration options for the service
 * @type {Object}
 */
Payments.defaultOpts = conf.get('/', { env: process.env.NODE_ENV });

module.exports = Payments;
