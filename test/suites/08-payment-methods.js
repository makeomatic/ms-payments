const { strictEqual } = require('assert');
const request = require('request-promise');
const Promise = require('bluebird');

describe('payment-methods', function suite() {
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

  describe('list action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.get({
        url: 'http://localhost:3000/payments/payment-methods/list',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    it('should return list of payment methods', async () => {
      // create stripe customer
      await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents/create',
        body: {},
        headers: makeHeader(this.user0.jwt),
        json: true });
      // create payment methods
      await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/attach',
        body: { paymentMethod: 'pm_card_authenticationRequired' },
        headers: makeHeader(this.user0.jwt),
        json: true });
      await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/attach',
        body: { paymentMethod: 'pm_card_authenticationRequiredOnSetup', useAsDefault: false },
        headers: makeHeader(this.user0.jwt),
        json: true });

      const response = await request.get({
        url: 'http://localhost:3000/payments/payment-methods/list',
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response.meta.defaultPaymentMethodType, 'payment-method-stripe-card');
      strictEqual(response.meta.defaultPaymentMethodId, response.data[0].id);

      strictEqual(response.data[0].type, 'payment-method-stripe-card');
      strictEqual(response.data[0].attributes.cardBrand, 'visa');
      strictEqual(response.data[0].attributes.cardLast4, '3184');

      strictEqual(response.data[1].type, 'payment-method-stripe-card');
      strictEqual(response.data[1].attributes.cardBrand, 'visa');
      strictEqual(response.data[1].attributes.cardLast4, '3155');

      cachedPaymentMethodId = response.data[1].id;
    });
  });

  describe('set-default action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.get({
        url: 'http://localhost:3000/payments/payment-methods/set-default',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    it('should update default payment method', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/payment-methods/set-default',
        headers: makeHeader(this.user0.jwt),
        body: `{"type":"payment-method-stripe-card","id":"${cachedPaymentMethodId}"}` });

      strictEqual(response, `{"meta":{"updated":true,"id":"${cachedPaymentMethodId}",`
        + '"defaultPaymentMethodType":"payment-method-stripe-card",'
        + `"defaultPaymentMethodId":"${cachedPaymentMethodId}"}}`);

      const response1 = await request.get({
        url: 'http://localhost:3000/payments/payment-methods/list',
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response1.meta.defaultPaymentMethodType, 'payment-method-stripe-card');
      strictEqual(response1.meta.defaultPaymentMethodId, cachedPaymentMethodId);
    });
  });
});
