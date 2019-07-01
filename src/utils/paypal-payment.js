const { ValidationError } = require('common-errors');
const Promise = require('bluebird');
const invoke = require('lodash/invoke');
const paypalClient = require('paypal-rest-sdk');
const retry = require('bluebird-retry');

const assertArray = require('./asserts/array');
const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertPlainObject = require('./asserts/plain-object');

const invalidConfig = new ValidationError('Paypal config is invalid');
// @todo from config
const retryConfig = {
  interval: 500,
  backoff: 500,
  max_interval: 5000,
  timeout: 5000,
  max_tries: 10,
  throw_original: true,
  predicate: { code: 429 } };

class Paypal {
  static paymentIdToChargeIdKey() {
    return 'paypal-payment:internal:ids';
  }

  constructor(config, redis) {
    assertPlainObject(config, invalidConfig);
    assertPlainObject(config.client, invalidConfig);
    assertPlainObject(config.urls, invalidConfig);
    assertStringNotEmpty(config.client.mode, invalidConfig);
    assertStringNotEmpty(config.client.client_id, invalidConfig);
    assertStringNotEmpty(config.client.client_secret, invalidConfig);
    assertStringNotEmpty(config.urls.payments_cancel, invalidConfig);
    assertStringNotEmpty(config.urls.payments_return, invalidConfig);

    this.config = config;
    this.redis = redis;
  }

  async request(path, params) {
    assertStringNotEmpty(path, 'invalid path');
    assertArray(params, 'invalid params');

    return Promise.fromCallback(callback => retry(
      invoke,
      Object.assign({ args: [paypalClient, path, ...params, this.config.client, callback] }, retryConfig)
    ));
  }

  async createPayment(internalId, params) {
    assertStringNotEmpty(internalId, 'internalId is invalid');
    assertPlainObject(params, 'params is invalid');

    const { payments_return: returnUrl, payments_cancel: cancelUrl } = this.config.urls;
    const payload = {
      intent: 'sale',
      payer: { payment_method: 'paypal' },
      redirect_urls: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
      transactions: [{
        amount: {
          // cents to dollars
          total: (params.amount / 100).toFixed(2),
          currency: 'USD',
        },
        description: params.description,
        custom: internalId,
      }],
    };

    return this.request('payment.create', [payload]);
  }

  async execute(paymentId, payerId) {
    assertStringNotEmpty(paymentId, 'paymentId is invalid');
    assertStringNotEmpty(payerId, 'payerId is invalid');

    const payload = {
      payer_id: payerId,
    };

    return this.request('payment.execute', [paymentId, payload]);
  }

  async setInternalId(paypalPaymentId, internalId, pipeline) {
    if (pipeline !== undefined) {
      pipeline.hset(Paypal.paymentIdToChargeIdKey(), paypalPaymentId, internalId);
    } else {
      await this.redis.hset(Paypal.paymentIdToChargeIdKey(), paypalPaymentId, internalId);
    }
  }

  async getInternalId(paypalPaymentId) {
    return this.redis.hget(Paypal.paymentIdToChargeIdKey(), paypalPaymentId);
  }
}

module.exports = Paypal;
