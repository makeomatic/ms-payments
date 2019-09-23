const { strictEqual } = require('assert');
const request = require('request-promise');
const uuid = require('uuid/v4');
const Promise = require('bluebird');

describe('stripe', function suite() {
  const Payments = require('../../src');
  const { getToken, makeHeader } = require('../helpers/auth');

  const service = new Payments({ stripe: { enabled: true } });

  before('start service', () => service.connect());
  before('login users', async () => {
    this.admin0 = (await getToken.call(service, 'test@test.ru'));
    this.user0 = (await getToken.call(service, 'user0@test.com'));
  });
  before('remove stripe data from redis', async () => {
    const keys = service.redis.keys('*stripe*').map((key) => service.redis.del(key.replace('{ms-payments}', '')));

    return Promise.all(keys);
  });
  before('remove user metadata', async () => service.users
    .setMetadata(this.user0.user.id, service.users.paymentAudience, { $remove: ['internalStripeCustomerId'] }));

  let cachedPaymentMethodId;

  describe('setup-intents/create action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents/create',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    it('should setup intents using stripe API and return token', async () => {
      // internal customer is not created yet
      const response1 = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents/create',
        body: {},
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response1.data.type, 'stripe-payment-intent');
      strictEqual(response1.data.attributes.clientSecret.startsWith('seti_'), true);

      // internal customer is created
      const response2 = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents/create',
        body: {},
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response2.data.type, 'stripe-payment-intent');
      strictEqual(response2.data.attributes.clientSecret.startsWith('seti_'), true);
    });
  });

  describe('payment-methods/attach action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/attach',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    // depends on `setup intents action` suite
    it('should attach payment method and set it as default', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/attach',
        body: { paymentMethod: 'pm_card_authenticationRequired' },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response.data.type, 'payment-method-stripe-card');
      strictEqual(response.data.attributes.cardBrand, 'visa');
      strictEqual(response.data.attributes.cardLast4, '3184');

      cachedPaymentMethodId = response.data.id;
    });
  });

  describe('payment-methods/delete action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/delete',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    // depends on `setup intents action` suite
    it('should return error if payment id not found', async () => {
      const id = uuid();
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/delete',
        body: `{"id":"${id}"}`,
        headers: makeHeader(this.user0.jwt),
        simple: false });

      strictEqual(response, `{"statusCode":404,"error":"Not Found","message":"Payment method #${id}`
        + ' not found","name":"HttpStatusError"}');
    });

    // depends on `setup intents action` suite
    it('should delete payment method and null as default pay,ent method', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/delete',
        body: `{"id":"${cachedPaymentMethodId}"}`,
        headers: makeHeader(this.user0.jwt) });

      strictEqual(response, `{"meta":{"deleted":true,"id":"${cachedPaymentMethodId}",`
        + '"defaultPaymentMethodType":null,"defaultPaymentMethodId":null}}');
    });
  });
});
