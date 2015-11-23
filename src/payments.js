const AMQPTransport = require('ms-amqp-transport')
const Validation = require('ms-amqp-validation')
const Mailer = require('ms-mailer-client')
const Promise = require('bluebird')
const Errors = require('common-errors')
const ld = require('lodash')
const redis = require('ioredis')
const paypal = require('paypal-rest-sdk')

const { format: fmt } = require('util')
const bunyan = require('bunyan')

// validator configuration
const createValidator = require('./validator.js')

// actions
const planCreate = require('./actions/planCreate.js')
const planList   = require('./actions/planList.js')
const planDelete = require('./actions/planDelete.js')
const planUpdate = require('./actions/planUpdate.js')
const planState  = require('./actions/planState.js')

const agreementCreate = require('./actions/agreementCreate.js')
const agreementExecute = require('./actions/agreementExecute.js')

const MService = require('mservice')

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
      debug: process.env.NODE_ENV === 'development',
      plugins: [ 'logger', 'amqp', 'redisCluster', 'validator' ],
      prefix: 'payments',
      // postfixes for routes that we support
      postfix: {
        plan: {
          create: "plan_create",
          update: "plan_update",
          list: "plan_list",
          delete: "plan_delete",
          state: "plan_state"
        },
        agreement: {
          create: "agreement_create",
          execute: "agreement_execute"
        }
      },
      amqp: {
        queue: 'ms-payments',
      },
      redis: {
        options: {
          keyPrefix: '{ms-payments}',
        },
      },
      paypal: {
        mode: "sandbox",
        client_id: "ASfLM0CKCfS1qAA5OhyGAQ7kneCBvvkpVkphYITmbnCXwqBCrGO1IDk6k842YnbRBVoWp3fqzJe4FaNx",
        client_secret: "EOu4zIgcRwNACG3XMQTUHiwZtc4lDfhO8xlKyK5t1_XBiJl8adpam88GoujJMhIRm9lsTfBdQ1IgCPYv"
      },
      validator: [ __dirname + '/../schemas' ]
  }

  /**
   * Create Payments instance
   * @param  {Object} opts
   * @return {Payments}
   */
  constructor(opts = {}) {
    super(ld.merge({}, Payments.defaultOpts, opts))
    // load validation schemas
    //this.validator = createValidator(this._config.validator)
  }

  /**
   * Router instance, bound to Payments module
   * @param  {Object}   message
   * @param  {Object}   headers
   * @param  {Object}   actions
   * @param  {Function} next
   * @return {Promise}
   */
  router(message, headers, actions, next) {
    const route = headers.routingKey.split('.').pop()
    const defaultRoutes = Payments.defaultOpts.postfix
    const { postfix } = this._config

    let promise
    switch (route) {
      case postfix.plan.create:
        promise = this._validate("plan", message).then(this._createPlan)
        break
      case postfix.plan.delete:
        promise = this._validate("plan-delete", message).then(this._deletePlan)
        break
      case postfix.plan.list:
        promise = this._validate("plan-get", message).then(this._listPlans)
        break
      case postfix.plan.update:
        promise = this._validate("plan-update", message).then(this._updatePlans)
        break
      case postfix.plan.state:
        promise = this._validate("plan-state", message).then(this._statePlan)
        break
      case postfix.agreement.create:
        promise = this._validate("agreement", message).then(this._createAgreement)
        break
      case postfix.agreement.execute:
        promise = this._validate("agreement-execute", message).then(this._executeAgreement)
        break
      default:
        promise = Promise.reject(new Errors.NotImplementedError(fmt('method "%s"', route))).bind(this)
        break
    }

    // if we have an error
    promise.catch(function reportError(err) {
      this.log.error('Error performing %s operation', route, err)
    })

    if (typeof next === 'function') {
      return promise.asCallback(next)
    }

    return promise
  }

  /**
   * @private
   * @param  {String} schema
   * @param  {Object} message
   * @return {Promise}
   */
  _validate(schema, message) {
    return this.validator.validate(schema, message)
      .bind(this)
      .return(message)
      .catch((error) => {
        //this.log.warn('Validation error:', error.toJSON());
        throw error;
        //this.log.warn('Validation error:', error.errors)
        //throw new Errors.ValidationError(this.validator.readable(error.errors))
      })
  }

  /**
   * @private
   * @param  {String} message
   * @return {Promise}
   */
  _createPlan(message) {
    return planCreate.call(this, message)
  }

  _deletePlan(message) {
    return planDelete.call(this, message)
  }

  _listPlans(message) {
    return planList.call(this, message)
  }

  _updatePlans(message) {
    return planUpdate.call(this, message)
  }

  _statePlan(message) {
    return planState.call(this, message)
  }

  _createAgreement(message) {
    return agreementCreate.call(this, message)
  }

  _executeAgreement(message) {
    return agreementExecute.call(this, message)
  }

}

module.exports = Payments
