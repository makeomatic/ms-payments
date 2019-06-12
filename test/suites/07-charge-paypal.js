const { strictEqual } = require('assert');
const request = require('request-promise');

const config = require('../config');
const { getToken, makeHeader } = require('../helpers/auth');
const { isUUIDv4 } = require('../helpers/uuid');

describe('charge.paypal', function suite() {
  const Payments = require('../../src');
  const service = new Payments(Object.assign({}, config, { stripe: { enabled: true, webhook: { enabled: true } } }));

  let successChargeId;

  before('start service', () => service.connect());
  before(async () => {
    this.admin0 = (await getToken.call(service, 'test@test.ru'));
    this.user0 = (await getToken.call(service, 'user0@test.com'));
  });

  after(async () => {
    await service.redis.del(`${this.user0.user.id}:balance`);
    await service.redis.del(`${this.user0.user.id}:charges`);
    await service.redis.del(`charge:${successChargeId}`);
  });

  describe('create action', () => {
    let paypalPaymentId;

    it('should create success paypal charge', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/charge/paypal/create',
        body: {
          amount: 1005,
          description: 'Feed the cat' },
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
      strictEqual(response.meta.paypal.approvalUrl.href.includes('https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token='), true);
      strictEqual(response.meta.paypal.approvalUrl.rel, 'approval_url');
      strictEqual(response.meta.paypal.approvalUrl.method, 'REDIRECT');

      successChargeId = response.data.id;

      const charge = await service.redis.hgetall(`charge:${successChargeId}`);
      const internalId = await service.redis.hget('paypal-payment:internal:ids', charge.sourceId);

      paypalPaymentId = charge.sourceId;

      strictEqual(internalId, successChargeId);
      strictEqual(charge.id, successChargeId);
      strictEqual(charge.amount, '1005');
      strictEqual(charge.description, 'Feed the cat');
      strictEqual(charge.owner, this.user0.user.id);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '0');
      strictEqual(charge.failReason, '');
      strictEqual(charge.metadata, `{"owner":"${this.user0.user.id}","amount":1005,"description":"Feed the cat"}`);
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

    // @todo payer_id is not testable, do mock?
    it.skip('should execute paypal payment and increase balance', async () => {
      // eslint-disable-next-line no-unused-vars
      const response = await request.get({
        url: 'http://localhost:3000/payments/charge/paypal/return',
        qs: {
          PayerID: 'CR87QHB7JTRSC',
          paymentId: paypalPaymentId },
        headers: makeHeader(this.user0.jwt),
        json: true });
    });
  });
});