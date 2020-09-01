const { strictEqual } = require('assert');
const StripeClient = require('stripe');
const retry = require('bluebird-retry');
const invoke = require('lodash/invoke');
const { ValidationError } = require('common-errors');

const assertArray = require('../asserts/array');
const assertPlainObject = require('../asserts/plain-object');
const assertString = require('../asserts/string');
const assertStringNotEmpty = require('../asserts/string-not-empty');

const invalidConfig = new ValidationError('Stripe config for client is invalid');

class Client {
  constructor(secretKey, config) {
    assertPlainObject(config, invalidConfig);
    assertPlainObject(config.retry, invalidConfig);
    assertStringNotEmpty(config.apiVersion, invalidConfig);

    this.config = config;

    if (secretKey) {
      assertStringNotEmpty(secretKey, invalidConfig);

      this.stripeClient = StripeClient(secretKey);
      this.stripeClient.setApiVersion(config.apiVersion);
    }
  }

  async request(path, params, idempotencyKey = '') {
    assertStringNotEmpty(path, 'invalid path');
    assertArray(params, 'invalid params');
    assertString(idempotencyKey, 'invalid idempotencyKey');
    strictEqual(this.stripeClient !== undefined, true, 'stripe.secretKey is not set');

    const { retry: retryConfig } = this.config;
    const args = [this.stripeClient, path, ...params];

    if (idempotencyKey.length > 0) {
      args.push({ idempotency_key: idempotencyKey });
    }

    return retry(invoke, { args, ...retryConfig });
  }
}

module.exports = Client;
