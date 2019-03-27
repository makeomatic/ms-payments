const { ValidationError } = require('common-errors');
const pick = require('lodash/pick');
const StripeClient = require('stripe');
const moment = require('moment');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertPlainObject = require('./asserts/plain-object');

const invalidConfig = new ValidationError('Stripe config is invalid');

// @todo rate limit
class Stripe {
  static customerRedisKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:stripe:customer`;
  }

  constructor(config, redis) {
    assertPlainObject(config, invalidConfig);
    assertStringNotEmpty(config.secretKey, invalidConfig);
    assertStringNotEmpty(config.publicKey, invalidConfig);

    this.client = StripeClient(config.secretKey);
    this.config = config;
    this.redis = redis;
  }

  async storedCustomer(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    const customer = await this.redis.hgetall(Stripe.customerRedisKey(owner));

    return Object.keys(customer).length !== 0 ? customer : null;
  }

  async createCustomer(owner, params) {
    assertStringNotEmpty(owner, 'owner is invalid');
    assertPlainObject(params, 'params is invalid');

    const customer = await this.client.customers.create(params);
    const data = pick(customer, Stripe.CUSTOMER_FIELDS_FOR_SAVE);

    data.createAt = moment().format();
    data.owner = owner;
    data.metadata = JSON.stringify(customer);

    await this.redis.hmset(Stripe.customerRedisKey(owner), data);

    return data;
  }

  async updateCustomer(owner, customerId, params) {
    assertStringNotEmpty(owner, 'owner is invalid');
    assertStringNotEmpty(customerId, 'customerId is invalid');
    assertPlainObject(params, 'params is invalid');

    const updatedCustomer = await this.client.customers.update(customerId, params);
    const data = pick(updatedCustomer, Stripe.CUSTOMER_FIELDS_FOR_SAVE);
    const pipeline = this.redis.pipeline();

    data.createAt = moment().format();
    data.owner = owner;
    data.metadata = JSON.stringify(updatedCustomer);

    pipeline.del(Stripe.customerRedisKey(owner));
    pipeline.hmset(Stripe.customerRedisKey(owner), data);

    await pipeline.exec();

    return data;
  }

  async charge(params) {
    assertPlainObject(params, 'params is invalid');

    return this.client.charges.create(Object.assign({ currency: 'USD' }, params));
  }
}

Stripe.CUSTOMER_FIELDS_FOR_SAVE = ['id', 'default_source', 'email'];
Stripe.CHARGE_SOURCE_STRIPE = 'stripe';

module.exports = Stripe;
