const { ValidationError } = require('common-errors');
const Promise = require('bluebird');
const assert = require('assert');
const pick = require('lodash/pick');
const invoke = require('lodash/invoke');
const isEqual = require('lodash/isEqual');
const sortBy = require('lodash/sortBy');
const noop = require('lodash/noop');
const StripeClient = require('stripe');
const moment = require('moment');
const retry = require('bluebird-retry');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertString = require('./asserts/string');
const assertPlainObject = require('./asserts/plain-object');
const assertArray = require('./asserts/array');
const RedisMapper = require('./redis-mapper');

const invalidConfig = new ValidationError('Stripe config is invalid');

class Stripe {
  static customerRedisKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:stripe:customer`;
  }

  static webhookRedisKey(id) {
    assertStringNotEmpty(id, 'id is invalid');

    return `stripe:webhook:${id}`;
  }

  constructor(config, redis) {
    assertPlainObject(config, invalidConfig);
    assertStringNotEmpty(config.secretKey, invalidConfig);
    assertStringNotEmpty(config.publicKey, invalidConfig);
    assertPlainObject(config.client, invalidConfig);
    assertPlainObject(config.client.retry, invalidConfig);
    assertStringNotEmpty(config.client.apiVersion, invalidConfig);

    this.client = StripeClient(config.secretKey);
    this.livemode = config.secretKey.startsWith('sk_live_');
    this.client.setApiVersion(config.client.apiVersion);
    this.config = config;
    this.redis = redis;
    this.mapper = new RedisMapper(redis);
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

    return retry(invoke, Object.assign({ args }, retryConfig));
  }

  async storedCustomer(owner) {
    return this.mapper.get(Stripe.customerRedisKey(owner));
  }

  async createCustomer(owner, params) {
    assertStringNotEmpty(owner, 'owner is invalid');
    assertPlainObject(params, 'params is invalid');

    const customer = await this.request('customers.create', [params], `customer:create:${owner}`);
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

    const updatedCustomer = await this.request('customers.update', [customerId, params]);
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

  async charge(internalId, params) {
    assertStringNotEmpty(internalId, 'internalId is invalid');
    assertPlainObject(params, 'params is invalid');

    const metadata = params.metadata === undefined
      ? { internalId }
      : Object.assign({}, params.metadata, { internalId });
    const chargeParams = Object.assign({ currency: 'USD' }, params, { metadata });

    return this.request('charges.create', [chargeParams], `charge:${internalId}`);
  }

  async dropHooks() {
    assert(this.livemode === false, 'must not drop hooks in live mode');

    const { data: webhooks } = await this.request('webhookEndpoints.list', [{
      limit: 100,
    }]);

    const work = [];
    for (const webhook of webhooks) {
      work.push(this.request('webhookEndpoints.del', [webhook.id]));
    }

    await Promise.all(work);
  }

  async setupWebhook() {
    for (const webhookConfig of this.config.webhook.endpoints) {
      const { id, forceRecreate, url, enabledEvents } = webhookConfig;
      let webhook = null;

      // eslint-disable-next-line no-await-in-loop
      webhook = await this.mapper.get(Stripe.webhookRedisKey(id));

      if (forceRecreate) {
        // eslint-disable-next-line no-await-in-loop
        await this.redis.del(Stripe.webhookRedisKey(id));

        if (webhook !== null) {
          // eslint-disable-next-line no-await-in-loop
          await Promise
            .resolve(this.request('webhookEndpoints.del', [webhook.stripeId]))
            .catch({ statusCode: 404 }, noop);
        }

        webhook = null;
      }

      if (webhook === null) {
        // eslint-disable-next-line no-await-in-loop
        await this.upsertWebhook(webhookConfig);

        // eslint-disable-next-line no-continue
        continue;
      }

      // note can't update api version
      if (webhook.url !== url || !isEqual(sortBy(webhook.enabledEvents), sortBy(enabledEvents))) {
        // eslint-disable-next-line no-await-in-loop
        await this.upsertWebhook(webhookConfig, webhook.stripeId);
      }
    }
  }

  async upsertWebhook(config, stripeId) {
    const { id, url, enabledEvents, apiVersion } = config;
    const stripeWebhookParams = {
      url,
      enabled_events: enabledEvents,
      api_version: apiVersion,
    };
    const stripeWebhook = stripeId === undefined
      ? await this.request('webhookEndpoints.create', [stripeWebhookParams], `webhook:create:${id}`)
      : await this.request('webhookEndpoints.update', [stripeId, stripeWebhookParams]);
    const webhook = {
      createAt: moment().format(),
      secret: stripeWebhook.secret,
      stripeId: stripeWebhook.id,
      stripeMetada: JSON.stringify(stripeWebhook),
      ...config,
    };

    await this.redis.hmset(Stripe.webhookRedisKey(id), webhook);

    return webhook;
  }

  async getEventFromRequest(internalWebhookId, request) {
    assertStringNotEmpty(internalWebhookId, 'internalWebhookId is invalid');
    assertStringNotEmpty(request.headers['stripe-signature'], 'stripe signature is invalid');

    const { secret } = await this.mapper.get(Stripe.webhookRedisKey(internalWebhookId), ['secret']);
    const sig = request.headers['stripe-signature'];

    return this.client.webhooks.constructEvent(request.params, sig, secret);
  }
}

Stripe.CUSTOMER_FIELDS_FOR_SAVE = ['id', 'default_source', 'email'];

module.exports = Stripe;
