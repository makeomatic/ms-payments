const Promise = require('bluebird');
const { Microfleet, ConnectorsTypes } = require('@microfleet/core');
const fsort = require('redis-filtered-sort');
const merge = require('lodash/merge');
const Mailer = require('ms-mailer-client');
const conf = require('./conf');

// internal actions
const createPlan = require('./actions/plan/create');
const syncSaleTransactions = require('./actions/sale/sync');
const syncAgreements = require('./actions/agreement/sync');

/**
 * Class representing payments handling
 * @extends MService
 */
class Payments extends Microfleet {
  /**
   * Configuration options for the service
   * @type {Object}
   */
  static defaultOpts = conf.get('/', { env: process.env.NODE_ENV });

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

    // add migration connector
    if (this.config.migrations.enabled === true) {
      this.addConnector(ConnectorsTypes.migration, () => (
        this.migrate('redis', `${__dirname}/migrations`)
      ));
    }

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
