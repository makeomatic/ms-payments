const { ValidationError, HttpStatusError } = require('common-errors');
const invoke = require('lodash/invoke');
const StripeClient = require('stripe');
const retry = require('bluebird-retry');
const uuid = require('uuid/v4');
const Promise = require('bluebird');
const moment = require('moment');

const RedisMapper = require('./redis-mapper');
const assertArray = require('./asserts/array');
const assertPlainObject = require('./asserts/plain-object');
const assertString = require('./asserts/string');
const assertStringNotEmpty = require('./asserts/string-not-empty');

const invalidConfig = new ValidationError('Stripe config is invalid');
const isNotEnabled = new HttpStatusError(501, 'Stripe is not enabled');
const customerNotFound = new HttpStatusError(412, 'Create stripe customer first');

class Stripe {
  static customerRedisKey(internalCustomerId) {
    assertStringNotEmpty(internalCustomerId, 'internalId is invalid');

    return `${internalCustomerId}:stripe:customer`;
  }

  static paymentMethodRedisCollectionKey(internalCustomerId) {
    assertStringNotEmpty(internalCustomerId, 'internalCustomerId is invalid');

    return `${internalCustomerId}:stripe:payment:methods`;
  }

  static paymentMethodRedisDataKeyPrefix() {
    return 'stripe:payment:methods:data';
  }

  static getCustomerIdFromPaymentsMeta(metadata, options) {
    assertPlainObject(metadata, 'metadata is invalid');
    assertPlainObject(metadata, 'options is invalid');

    const { internalStripeCustomerId = null } = metadata;
    const { assertNotNull = false } = options;

    if (internalStripeCustomerId === null && assertNotNull === true) {
      throw customerNotFound;
    }

    return internalStripeCustomerId;
  }

  constructor(config, redis, users) {
    assertPlainObject(config, invalidConfig);
    assertStringNotEmpty(config.secretKey, invalidConfig);
    assertStringNotEmpty(config.publicKey, invalidConfig);
    assertPlainObject(config.client, invalidConfig);
    assertPlainObject(config.client.retry, invalidConfig);
    assertStringNotEmpty(config.client.apiVersion, invalidConfig);

    this.client = StripeClient(config.secretKey);
    this.config = config;
    this.redis = redis;
    this.redisMapper = new RedisMapper(redis);
    this.users = users;

    this.client.setApiVersion(config.client.apiVersion);
  }

  async request(path, params, idempotencyKey = '') {
    assertStringNotEmpty(path, 'invalid path');
    assertArray(params, 'invalid params');
    assertString(idempotencyKey, 'invalid idempotencyKey');

    const { client: { retry: retryConfig } } = this.config;
    const args = [this.client, path, ...params];

    if (idempotencyKey.length > 0) {
      args.push({ idempotency_key: idempotencyKey });
    }

    return retry(invoke, { args, ...retryConfig });
  }

  async setupIntents(stripeCustomerId) {
    assertStringNotEmpty(stripeCustomerId, 'stripeCustomerId is invalid');

    const params = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    };

    return this.request('setupIntents.create', [params]);
  }

  async createCustomer() {
    const internalId = uuid();
    const stripeParams = { metadata: { internalId } };
    const stripeCustomer = await this.request('customers.create', [stripeParams], `customer:create:${internalId}`);
    const internalData = {
      internalId,
      stripeId: stripeCustomer.id,
      createdAt: moment().format(),
      updatedAt: moment().format(),
      metadata: JSON.stringify(stripeCustomer),
    };

    await this.redis.hmset(Stripe.customerRedisKey(internalId), internalData);

    return internalData;
  }

  async getCustomer(internalId) {
    assertStringNotEmpty(internalId, 'internalId is invalid');

    return this.redisMapper.get(Stripe.customerRedisKey(internalId));
  }

  async deleteCustomer(internalId) {
    assertStringNotEmpty(internalId, 'internalId is invalid');

    const internalCustomer = await this.getCustomer(internalId);

    await Promise.all([
      this.redis.del(Stripe.customerRedisKey(internalId)),
      this.request('customers.del', [internalCustomer.stripeId], `customer:del:${internalId}`),
    ]);
  }

  /**
   * Resolve internal customer id from user's getMetadata
   * and then create or retrieve internal customer object
   * @param {string} userId
   * @return {object}
   */
  async setupCustomerForUserId(userId) {
    assertStringNotEmpty(userId, 'userId is invalid');

    const { users } = this;
    const { internalStripeCustomerId = null } = await users.getMetadata(userId, users.paymentAudience, { public: false });
    let internalCustomer = null;

    if (internalStripeCustomerId === null) {
      internalCustomer = await this.createCustomer();
      await users
        .setMetadata(userId, users.paymentAudience, { $set: { internalStripeCustomerId: internalCustomer.internalId } })
        .tapCatch(() => this.deleteCustomer(internalCustomer.internalId));
    } else {
      internalCustomer = await this.getCustomer(internalStripeCustomerId);
    }

    return internalCustomer;
  }

  async attachPaymentMethod(paymentMethod, internalCustomerId) {
    assertStringNotEmpty(paymentMethod, 'paymentMethod is invalid');
    assertStringNotEmpty(internalCustomerId, 'internalCustomerId is invalid');

    const internalId = uuid();
    const customer = await this.getCustomer(internalCustomerId);
    const stripeParams = { customer: customer.stripeId };

    const stripePaymentMethod = await this
      .request('paymentMethods.attach', [paymentMethod, stripeParams], `payment:methods:attach:${internalId}`);

    const internalData = {
      internalId,
      stripeId: stripePaymentMethod.id,
      cardBrand: stripePaymentMethod.card.brand,
      cardLast4: stripePaymentMethod.card.last4,
      createdAt: moment().format(),
      updatedAt: moment().format(),
      metadata: JSON.stringify(stripePaymentMethod),
    };

    await this.redisMapper.addToCollection(
      Stripe.paymentMethodRedisCollectionKey(internalCustomerId),
      Stripe.paymentMethodRedisDataKeyPrefix(),
      internalId,
      internalData
    );

    return internalData;
  }

  internalGetPaymentMethods(internalCustomerId) {
    assertStringNotEmpty(internalCustomerId, 'internalCustomerId is invalid');

    return this.redisMapper.fetchCollection(
      Stripe.paymentMethodRedisCollectionKey(internalCustomerId),
      Stripe.paymentMethodRedisDataKeyPrefix()
    );
  }

  internalGetPaymentMethod(internalPaymentMethodId) {
    assertStringNotEmpty(internalPaymentMethodId, 'internalPaymentMethodId is invalid');

    return this.redisMapper.get([Stripe.paymentMethodRedisDataKeyPrefix(), internalPaymentMethodId].join(':'));
  }

  async deletePaymentMethod(internalCustomerId, internalPaymentMethodId) {
    assertStringNotEmpty(internalCustomerId, 'internalCustomerId is invalid');
    assertStringNotEmpty(internalPaymentMethodId, 'internalPaymentMethodId is invalid');

    const paymentMethod = await this.internalGetPaymentMethod(internalPaymentMethodId);

    // it's more important to delete a payment method form redis
    // than to delete a payment method from stripe
    // move this to stripe webhook callback if consistent delete is needed
    await this.redisMapper.deleteFromCollection(
      Stripe.paymentMethodRedisCollectionKey(internalCustomerId),
      Stripe.paymentMethodRedisDataKeyPrefix(),
      internalPaymentMethodId
    );

    return this
      .request('paymentMethods.detach', [paymentMethod.stripeId], `payment:methods:detach:${paymentMethod.stripeId}`);
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

Stripe.PAYMENT_METHOD_CARD = 'payment-method-stripe-card';

module.exports = Stripe;
