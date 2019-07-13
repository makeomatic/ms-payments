const request = require('request-promise');
const assert = require('assert');

const { strictEqual } = assert;
const { getToken, makeHeader } = require('../helpers/auth');
const { isUUIDv4 } = require('../helpers/uuid');
const { initChrome, closeChrome, approveSale } = require('../helpers/chrome');

describe('charge.paypal', function suite() {
  const Payments = require('../../src');
  const Charge = require('../../src/utils/charge');
  const service = new Payments();

  before('start service', () => service.connect());
  before('get user tokens', async () => {
    this.admin0 = await getToken.call(service, 'test@test.ru');
    this.user0 = await getToken.call(service, 'user0@test.com');
  });

  after(async () => {
    await service.redis.del(`${this.user0.user.id}:balance`);
    await service.redis.del(`${this.user0.user.id}:charges`);
  });

  describe('create action', () => {
    let approvalUrl;
    let PayerID;
    let paymentId;
    let PaymentToken;

    beforeEach('init Chrome', initChrome);
    afterEach('close chrome', closeChrome);

    describe('http', () => {
      it('should create success paypal charge', async () => {
        const response = await request.post({
          url: 'http://localhost:3000/payments/charge/paypal/create',
          body: {
            amount: 1005,
            description: 'Feed the cat',
            returnUrl: 'http://api-sandbox.cappasity.matic.ninja/paypal-payments-return',
            cancelUrl: 'http://api-sandbox.cappasity.matic.ninja/paypal-payments-cancel' },
          headers: makeHeader(this.user0.jwt),
          json: true });

        strictEqual(isUUIDv4(response.data.id), true);
        strictEqual(response.data.type, 'charge');
        strictEqual(response.data.attributes.amount, 1005);
        strictEqual(response.data.attributes.description, 'Feed the cat');
        strictEqual(response.data.attributes.status, 0);
        strictEqual(response.data.attributes.createAt !== undefined, true);
        strictEqual(response.data.attributes.owner, 'user0');
        strictEqual(response.data.attributes.failReason, '');
        strictEqual(
          response.meta.paypal.approvalUrl.href.includes('https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token='),
          true
        );
        strictEqual(response.meta.paypal.approvalUrl.rel, 'approval_url');
        strictEqual(response.meta.paypal.approvalUrl.method, 'REDIRECT');
        strictEqual(response.meta.paypal.paymentId.includes('PAYID'), true);

        const successChargeId = response.data.id;
        const charge = await service.redis.hgetall(`charge:${successChargeId}`);
        const internalId = await service.redis.hget('paypal-payment:internal:ids', charge.sourceId);

        strictEqual(internalId, successChargeId);
        strictEqual(charge.id, successChargeId);
        strictEqual(charge.amount, '1005');
        strictEqual(charge.description, 'Feed the cat');
        strictEqual(charge.owner, this.user0.user.id);
        strictEqual(charge.createAt !== undefined, true);
        strictEqual(charge.status, '0');
        strictEqual(charge.failReason, '');
        strictEqual(charge.metadata, `{"owner":"${this.user0.user.id}","amount":1005,`
          + '"description":"Feed the cat","returnUrl":"http://api-sandbox.cappasity.matic.ninja/paypal-payments-return",'
          + '"cancelUrl":"http://api-sandbox.cappasity.matic.ninja/paypal-payments-cancel"}');
        strictEqual(charge.source, 'paypal');
        strictEqual(charge.sourceId.includes('PAYID'), true);
        strictEqual(
          charge.sourceMetadata.includes(
            '"intent":"authorize","state":"created","payer":{"payment_method":"paypal"},'
              + '"transactions":[{"amount":{"total":"10.05","currency":"USD"},'
              + `"description":"Feed the cat","custom":"${successChargeId}"`
          ),
          true
        );
      });
    });

    describe('amqp', () => {
      beforeEach('should create success paypal charge', async () => {
        const response = await service.amqp.publishAndWait(
          'payments.charge.paypal.create',
          {
            amount: 1005,
            description: 'Feed the cat',
            returnUrl: 'http://api-sandbox.cappasity.matic.ninja/paypal-payments-return',
            cancelUrl: 'http://api-sandbox.cappasity.matic.ninja/paypal-payments-cancel',
          },
          { headers: makeHeader(this.user0.jwt) }
        );

        strictEqual(isUUIDv4(response.data.id), true);
        strictEqual(response.data.type, 'charge');
        strictEqual(response.data.attributes.amount, 1005);
        strictEqual(response.data.attributes.description, 'Feed the cat');
        strictEqual(response.data.attributes.status, 0);
        strictEqual(response.data.attributes.createAt !== undefined, true);
        strictEqual(response.data.attributes.owner, 'user0');
        strictEqual(response.data.attributes.failReason, '');
        strictEqual(
          response.meta.paypal.approvalUrl.href.includes('https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token='),
          true
        );
        strictEqual(response.meta.paypal.approvalUrl.rel, 'approval_url');
        strictEqual(response.meta.paypal.approvalUrl.method, 'REDIRECT');
        strictEqual(response.meta.paypal.paymentId.includes('PAYID'), true);

        const successChargeId = response.data.id;
        const charge = await service.redis.hgetall(`charge:${successChargeId}`);
        const internalId = await service.redis.hget('paypal-payment:internal:ids', charge.sourceId);

        strictEqual(internalId, successChargeId);
        strictEqual(charge.id, successChargeId);
        strictEqual(charge.amount, '1005');
        strictEqual(charge.description, 'Feed the cat');
        strictEqual(charge.owner, this.user0.user.id);
        strictEqual(charge.createAt !== undefined, true);
        strictEqual(charge.status, '0');
        strictEqual(charge.failReason, '');
        strictEqual(charge.metadata, `{"owner":"${this.user0.user.id}","amount":1005,`
          + '"description":"Feed the cat","returnUrl":"http://api-sandbox.cappasity.matic.ninja/paypal-payments-return",'
          + '"cancelUrl":"http://api-sandbox.cappasity.matic.ninja/paypal-payments-cancel"}');
        strictEqual(charge.source, 'paypal');
        strictEqual(charge.sourceId.includes('PAYID'), true);
        strictEqual(
          charge.sourceMetadata.includes(
            '"intent":"authorize","state":"created","payer":{"payment_method":"paypal"},'
              + '"transactions":[{"amount":{"total":"10.05","currency":"USD"},'
              + `"description":"Feed the cat","custom":"${successChargeId}"`
          ),
          true
        );

        approvalUrl = response.meta.paypal.approvalUrl.href;
      });

      beforeEach('should approve URL', async () => {
        const query = await approveSale(approvalUrl, /paypal-payments-return\?/);

        PayerID = query.payer_id;
        paymentId = query.payment_id;
        PaymentToken = query.token;
      });

      beforeEach('should execute paypal payment and respond with authorization data', async () => {
        const response = await service.amqp.publishAndWait('payments.charge.paypal.return', {
          PayerID,
          paymentId,
          token: PaymentToken,
        }, { timeout: 20000 });

        // normalized format response
        assert(response.data);
        assert(response.data.id);
        assert.equal(response.data.type, 'charge');
        assert(response.data.attributes);
        assert.equal(response.data.attributes.status, Charge.STATUS_AUTHORIZED);

        // meta
        assert(response.meta);
        assert(response.meta.paypal);
        assert(response.meta.paypal.payer);
        strictEqual(response.meta.paypal.payer.payment_method, 'paypal');
        strictEqual(response.meta.paypal.payer.status, 'VERIFIED');
        assert(response.meta.paypal.payer.payer_info);
        strictEqual(response.meta.paypal.payer.payer_info.country_code, 'US');
      });

      describe('authorize the charge', () => {
        it('should capture paypal charge', async () => {
          const response = await service.amqp.publishAndWait('payments.charge.paypal.capture', {
            paymentId,
          }, { timeout: 20000 });

          assert.ok(response.data);
          assert.ok(response.data.id);
          assert.equal(response.data.type, 'charge');
          assert.equal(response.data.attributes.status, Charge.STATUS_COMPLETED);

          console.info('%j', response);
        });
      });

      describe('void the charge', () => {
        it('should void paypal charge', async () => {
          const response = await service.amqp.publishAndWait('payments.charge.paypal.void', {
            paymentId,
          }, { timeout: 20000 });

          assert.ok(response.data);
          assert.ok(response.data.id);
          assert.equal(response.data.type, 'charge');
          assert.equal(response.data.attributes.status, Charge.STATUS_CANCELED);

          console.info('%j', response);
        });
      });
    });
  });
});
