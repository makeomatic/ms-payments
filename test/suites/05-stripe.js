const { strictEqual, deepStrictEqual } = require('assert');
const request = require('request-promise');
const fs = require('fs');
const path = require('path');
const replace = require('lodash/replace');

const config = require('../config');
const randomOwner = require('../helpers/random-owner');
const { createSignature } = require('../helpers/stripe');

const isUUIDv4 = string => /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(string);

describe('stripe', function suite() {
  const Payments = require('../../src');

  before('start service', async () => {
    this.service = new Payments(config);
    await this.service.connect();
  });

  describe('actions', () => {
    const owner = randomOwner();
    const failOwner = String(Number(randomOwner() - 1000));

    let successChargeId;
    let failChargeId;

    it('should create success stripe charge', async () => {
      const params = {
        owner,
        token: 'tok_mastercard',
        amount: 1001,
        description: 'Feed the cat',
        saveCard: true,
        email: 'perchik@cat.com' };

      const result = await this.service.amqp.publishAndWait('payments.charge.stripe.create', params);

      strictEqual(isUUIDv4(result.id), true);

      successChargeId = result.id;

      const charge = await this.service.redis.hgetall(`charge:${successChargeId}`);

      strictEqual(charge.id, successChargeId);
      strictEqual(charge.amount, '1001');
      strictEqual(charge.description, 'Feed the cat');
      strictEqual(charge.owner, owner);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '0');
      strictEqual(charge.failReason, '');
      strictEqual(charge.metadata, `{"owner":"${owner}","amount":1001,"description":"Feed the cat",`
        + '"saveCard":true,"email":"perchik@cat.com","metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, '');
      strictEqual(charge.sourceMetadata, '');
    });

    it('should complete charge and increase balance', async () => {
      const secret = await this.service.redis.hget('stripe:webhook:charge', 'secret');
      const payload = replace(
        fs.readFileSync(path.resolve(__dirname, '../helpers/mocks/stripe-webhook-successed.json'), 'utf8'),
        /{{INTERNAL_ID_PLACEHOLDER}}/g,
        successChargeId
      );
      const signature = createSignature(payload, secret);
      const response = await request.post({
        url: 'http://localhost:3000/payments/charge/stripe/webhook',
        body: payload,
        headers: { 'stripe-signature': signature } });

      deepStrictEqual(response, '{"received":true}');

      const charge = await this.service.redis.hgetall(`charge:${successChargeId}`);

      strictEqual(charge.id, successChargeId);
      strictEqual(charge.amount, '1001');
      strictEqual(charge.description, 'Feed the cat');
      strictEqual(charge.owner, owner);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '2');
      strictEqual(charge.failReason, '');
      strictEqual(charge.metadata, `{"owner":"${owner}","amount":1001,"description":"Feed the cat",`
        + '"saveCard":true,"email":"perchik@cat.com","metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, 'ch_1EKvTOAbVbjCtGTWjanopixO');
      strictEqual(charge.sourceMetadata !== '', true);

      const balance = await this.service.redis.get(`${owner}:balance`);

      strictEqual(balance, '1001');
    });

    it('should create failed stripe charge', async () => {
      const params = {
        owner: failOwner,
        token: 'tok_cvcCheckFail',
        amount: 100002,
        description: 'Feed the cat!!!!' };

      const result = await this.service.amqp.publishAndWait('payments.charge.stripe.create', params);

      strictEqual(isUUIDv4(result.id), true);

      failChargeId = result.id;

      const charge = await this.service.redis.hgetall(`charge:${failChargeId}`);

      strictEqual(charge.id, failChargeId);
      strictEqual(charge.amount, '100002');
      strictEqual(charge.description, 'Feed the cat!!!!');
      strictEqual(charge.owner, failOwner);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '0');
      strictEqual(charge.failReason, '');
      strictEqual(charge.metadata, `{"owner":"${failOwner}","amount":100002,"description":"Feed the cat!!!!",`
        + '"saveCard":false,"metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, '');
      strictEqual(charge.sourceMetadata, '');
    });

    it('should fail charge', async () => {
      const secret = await this.service.redis.hget('stripe:webhook:charge', 'secret');
      const payload = replace(
        fs.readFileSync(path.resolve(__dirname, '../helpers/mocks/stripe-webhook-failed.json'), 'utf8'),
        /{{INTERNAL_ID_PLACEHOLDER}}/g,
        failChargeId
      );
      const signature = createSignature(payload, secret);
      const response = await request.post({
        url: 'http://localhost:3000/payments/charge/stripe/webhook',
        body: payload,
        headers: { 'stripe-signature': signature } });

      deepStrictEqual(response, '{"received":true}');

      const charge = await this.service.redis.hgetall(`charge:${failChargeId}`);

      strictEqual(charge.id, failChargeId);
      strictEqual(charge.amount, '100002');
      strictEqual(charge.description, 'Feed the cat!!!!');
      strictEqual(charge.owner, failOwner);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '1');
      strictEqual(charge.failReason, 'Your card\'s security code is incorrect.');
      strictEqual(charge.metadata, `{"owner":"${failOwner}","amount":100002,"description":"Feed the cat!!!!",`
        + '"saveCard":false,"metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, 'ch_1ELBVGAbVbjCtGTWMdFR7AYA');
      strictEqual(charge.sourceMetadata !== '', true);

      const balance = await this.service.redis.get(`${failOwner}:balance`);

      strictEqual(balance, null);
    });

    it('should be able to get charges list', async () => {
      const result = await this.service.amqp.publishAndWait('payments.charge.list', { owner });

      strictEqual(result.page, 1);
      strictEqual(result.pages, 1);
      strictEqual(result.cursor, 20);

      strictEqual(result.items[0].id, successChargeId);
      strictEqual(result.items[0].amount, '1001');
      strictEqual(result.items[0].description, 'Feed the cat');
      strictEqual(result.items[0].createAt !== undefined, true);
      strictEqual(result.items[0].status, '2');
      strictEqual(result.items[0].failReason, '');
      strictEqual(result.items[0].metadata === undefined, true);
      strictEqual(result.items[0].source === undefined, true);
      strictEqual(result.items[0].sourceId === undefined, true);
      strictEqual(result.items[0].sourceMetadata === undefined, true);
      strictEqual(result.items[0].failMetadata === undefined, true);
    });

    it('should be able to get charge', async () => {
      const result = await this.service.amqp.publishAndWait('payments.charge.get', { id: successChargeId });

      strictEqual(result.id, successChargeId);
      strictEqual(result.amount, '1001');
      strictEqual(result.description, 'Feed the cat');
      strictEqual(result.createAt !== undefined, true);
      strictEqual(result.status, '2');
      strictEqual(result.failReason, '');
      strictEqual(result.metadata === undefined, true);
      strictEqual(result.source === undefined, true);
      strictEqual(result.sourceId === undefined, true);
      strictEqual(result.sourceMetadata === undefined, true);
      strictEqual(result.failMetadata === undefined, true);
    });
  });
});
