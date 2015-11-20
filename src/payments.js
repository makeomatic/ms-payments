const AMQPTransport = require('ms-amqp-transport')
const Validation = require('ms-amqp-validation')
const Mailer = require('ms-mailer-client')
const Promise = require('bluebird')
const Errors = require('common-errors')
const EventEmitter = require('eventemitter3')
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

const agreementCreate = require('./actions/agreementCreate.js')
const agreementExecute = require('./actions/agreementExecute.js')

/**
 * Class representing payments handling
 * @extends EventEmitter
 */
class Payments extends EventEmitter {

  /**
   * Configuration options for the service
   * @type {Object}
   */
  static defaultOpts() {
    return {
      debug: process.env.NODE_ENV === 'development',
      prefix: 'payments',
      // postfixes for routes that we support
      postfix: {
        // ban, supports both unban/ban actions
        ban: 'ban',
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
      }
    }
  }

  /**
   * Create Payments instance
   * @param  {Object} opts
   * @return {Payments}
   */
  constructor(opts = {}) {
    super()
    const config = this._config = ld.merge({}, Payments.defaultOpts(), opts)

    // map routes we listen to
    const { prefix } = config
    config.amqp.listen = ld.map(config.postfix, function assignPostfix(postfix) {
      return `${prefix}.${postfix}`
    })

    // define logger
    this.setLogger()

    // load validation schemas
    this.ajv = createValidator(__dirname + "../schemas")

    // test if config is valid
    const { isValid, errors } = this.ajv.validateSync('config', config)
    if (!isValid) {
      this.log.fatal('Invalid configuration:', errors)
      throw new Error(this.ajv.readable(errors))
    }
  }

  /**
   * Set logger
   */
  setLogger() {
    const config = this._config
    let {
      logger
    } = config
    if (!config.hasOwnProperty('logger')) {
      logger = config.debug
    }

    // define logger
    if (logger && logger instanceof bunyan) {
      this.log = logger
    } else {
      let stream
      if (logger) {
        stream = {
          stream: process.stdout,
          level: config.debug ? 'debug' : 'info',
        }
      } else {
        stream = {
          level: 'trace',
          type: 'raw',
          stream: new bunyan.RingBuffer({
            limit: 100
          }),
        }
      }
      this.log = bunyan.createLogger({
        name: 'ms-payments',
        streams: [stream],
      })
    }
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
    const defaultRoutes = Payments.defaultOpts().postfix
    const { postfix } = this._config

    let promise
    switch (route) {
      case postfix.createPlan:
        promise = this._validate("plan", message).then(this._createPlan)
        break
      default:
        promise = Promise.reject(new Errors.NotImplementedError(fmt('method "%s"', route)))
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
    return validate(route, message)
      .bind(this)
      .return(message)
      .catch((error) => {
        this.log.warn('Validation error:', error.errors)
        throw new Error(this.ajv.readable(error.errors))
      })
  }

  /**
   * @private
   * @param  {String} message
   * @return {Promise}
   */
  _createPlan(message) {
    return createPlan.call(this, message)
  }

  /**
   * @private
   * @return {Promise}
   */
  _connectRedis() {
    if (this._redis) {
      return Promise.reject(new Errors.NotPermittedError('redis was already started'))
    }

    const config = this._config.redis
    return new Promise(function redisClusterConnected(resolve, reject) {
        let onReady
        let onError

        const instance = new redis.Cluster(config.hosts, config.options || {})

        onReady = function redisConnect() {
          instance.removeListener('error', onError)
          resolve(instance)
        }

        onError = function redisError(err) {
          instance.removeListener('ready', onReady)
          reject(err)
        }

        instance.once('ready', onReady)
        instance.once('error', onError)
      })
      .tap((instance) => {
        this._redis = instance
      })
  }

  /**
   * @private
   * @return {Promise}
   */
  _closeRedis() {
    if (!this._redis) {
      return Promise.reject(new Errors.NotPermittedError('redis was not started'))
    }

    return this._redis
      .quit()
      .tap(() => {
        this._redis = null
      })
  }

  /**
   * @private
   * @return {Promise}
   */
  _connectAMQP() {
    if (this._amqp) {
      return Promise.reject(new Errors.NotPermittedError('amqp was already started'))
    }

    return AMQPTransport
      .connect(this._config.amqp, this.router)
      .tap((amqp) => {
        this._amqp = amqp
        this._mailer = new Mailer(amqp, this._config.mailer)
      })
      .catch((err) => {
        this.log.fatal('Error connecting to AMQP', err.toJSON())
        throw err
      })
  }

  /**
   * @private
   * @return {Promise}
   */
  _closeAMQP() {
    if (!this._amqp) {
      return Promise.reject(new Errors.NotPermittedError('amqp was not started'))
    }

    return this._amqp
      .close()
      .tap(() => {
        this._amqp = null
        this._mailer = null
      })
  }

  /**
   * @return {Promise}
   */
  connect() {
    return Promise.all([
        this._connectAMQP(),
        this._connectRedis(),
      ])
      .return(this)
  }

  /**
   * @return {Promise}
   */
  close() {
    return Promise.all([
      this._closeAMQP(),
      this._closeRedis(),
    ])
  }

}

module.exports = Payments
