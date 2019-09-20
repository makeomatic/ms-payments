const { strictEqual } = require('assert');
const request = require('request-promise');

describe('stripe', function suite() {
  const Payments = require('../../src');
  const { getToken, makeHeader } = require('../helpers/auth');

  const service = new Payments({ stripe: { enabled: true } });

  before('start service', () => service.connect());
  before('login users', async () => {
    this.admin0 = (await getToken.call(service, 'test@test.ru'));
    this.user0 = (await getToken.call(service, 'user0@test.com'));
  });

  describe('setup intents action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    it('should setup intents using stripe API and return token', async () => {
      // internal customer is not created yet
      const response1 = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents',
        body: {},
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response1.data.type, 'stripe-payment-intent');
      strictEqual(response1.data.attributes.clientSecret.startsWith('seti_'), true);

      // internal customer is created
      const response2 = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents',
        body: {},
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response2.data.type, 'stripe-payment-intent');
      strictEqual(response2.data.attributes.clientSecret.startsWith('seti_'), true);
    });
  });

  describe('attach payment method action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/attach-payment-methods',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    // depends on `setup intents action` suite
    it('should attach payment method and set it as default', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/attach-payment-methods',
        body: { paymentMethod: 'pm_card_authenticationRequired' },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response.data.type, 'payment-method-stripe-card');
      strictEqual(response.data.attributes.cardBrand, 'visa');
      strictEqual(response.data.attributes.cardLast4, '3184');
    });
  });
});
