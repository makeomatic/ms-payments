const { ValidationError, HttpStatusError } = require('common-errors');

const Client = require('./client');
const Customer = require('./customers');
const Intents = require('./intents');
const PaymentMethods = require('./payment-methods');
const RedisMapper = require('../redis-mapper');
const assertPlainObject = require('../asserts/plain-object');

const invalidConfig = new ValidationError('Stripe config is invalid');
const isNotEnabled = new HttpStatusError(501, 'Stripe is not enabled');

class Stripe {
  constructor(config, redis, users) {
    assertPlainObject(config, invalidConfig);

    this.config = config;
    this.users = users;

    this.client = new Client(config.secretKey, config.client);
    this.redisMapper = new RedisMapper(redis);

    this.customers = new Customer(config, this.client, redis, this.redisMapper, users);
    this.intents = new Intents(this.client);
    this.paymentMethods = new PaymentMethods(config, this.client, this.customers, this.redisMapper);
  }

  assertIsEnabled() {
    if (this.config.enabled === false) {
      throw isNotEnabled;
    }
  }

  isEnabled() {
    return this.config.enabled;
  }
}

module.exports = Stripe;
