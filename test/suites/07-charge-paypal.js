const { strictEqual } = require('assert');
const request = require('request-promise');

const { getToken, makeHeader } = require('../helpers/auth');
const { isUUIDv4 } = require('../helpers/uuid');

describe('charge.paypal', function suite() {
  const Payments = require('../../src');
  const service = new Payments();

  before('start service', () => service.connect());
  before('get user tokens', async () => {
    this.admin0 = (await getToken.call(service, 'test@test.ru'));
    this.user0 = (await getToken.call(service, 'user0@test.com'));
  });

  after(async () => {
    await service.redis.del(`${this.user0.user.id}:balance`);
    await service.redis.del(`${this.user0.user.id}:charges`);
  });

  describe('create action', () => {
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
            '"intent":"sale","state":"created","payer":{"payment_method":"paypal"},'
              + '"transactions":[{"amount":{"total":"10.05","currency":"USD"},'
              + `"description":"Feed the cat","custom":"${successChargeId}"`
          ),
          true
        );
      });
    });

    describe('amqp', () => {
      it('should create success paypal charge', async () => {
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
            '"intent":"sale","state":"created","payer":{"payment_method":"paypal"},'
              + '"transactions":[{"amount":{"total":"10.05","currency":"USD"},'
              + `"description":"Feed the cat","custom":"${successChargeId}"`
          ),
          true
        );
      });
    });

    // @todo payer_id is not testable, do mock?
    it.skip('should execute paypal payment and increase balance', async () => {
      // eslint-disable-next-line no-unused-vars
      const response = await request.get({
        url: 'http://localhost:3000/payments/charge/paypal/return',
        qs: {
          PayerID: 'CR87QHB7JTRSC',
          paymentId: 'paypalPaymentId',
          token: 'EC-2AG32291P06779036' },
        headers: makeHeader(this.user0.jwt),
        json: true });
    });
  });
});
