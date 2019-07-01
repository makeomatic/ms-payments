const { strictEqual, deepStrictEqual } = require('assert');
const request = require('request-promise');
const fs = require('fs');
const path = require('path');
const replace = require('lodash/replace');
const { inspectPromise } = require('@makeomatic/deploy');

const { createSignature } = require('../helpers/stripe');
const { getToken, makeHeader } = require('../helpers/auth');
const { isUUIDv4 } = require('../helpers/uuid');

describe('stripe', function suite() {
  const Payments = require('../../src');
  const service = new Payments({ stripe: { enabled: true, webhook: { enabled: true } } });
  let successChargeId;
  let failChargeId;

  before('start service', () => service.connect());
  before(async () => {
    this.admin0 = (await getToken.call(service, 'test@test.ru'));
    this.user0 = (await getToken.call(service, 'user0@test.com'));
  });

  after(async () => {
    await service.redis.del(`${this.user0.user.id}:balance`);
    await service.redis.del(`${this.user0.user.id}:charges`);
    await service.redis.del(`charge:${successChargeId}`);
    await service.redis.del(`charge:${failChargeId}`);
  });

  describe('create action', () => {
    it('should create success stripe charge', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/charge/stripe/create',
        body: {
          token: 'tok_mastercard',
          amount: 1001,
          description: 'Feed the cat',
          saveCard: true,
          email: 'perchik@cat.com' },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(isUUIDv4(response.data.id), true);
      strictEqual(response.data.type, 'charge');
      strictEqual(response.data.attributes.amount, 1001);
      strictEqual(response.data.attributes.description, 'Feed the cat');
      strictEqual(response.data.attributes.status, 0);
      strictEqual(response.data.attributes.createAt !== undefined, true);
      strictEqual(response.data.attributes.owner, 'user0');
      strictEqual(response.data.attributes.failReason, '');

      successChargeId = response.data.id;

      const charge = await service.redis.hgetall(`charge:${successChargeId}`);

      strictEqual(charge.id, successChargeId);
      strictEqual(charge.amount, '1001');
      strictEqual(charge.description, 'Feed the cat');
      strictEqual(charge.owner, this.user0.user.id);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '0');
      strictEqual(charge.failReason, '');
      strictEqual(charge.metadata, `{"owner":"${this.user0.user.id}","amount":1001,"description":"Feed the cat",`
        + '"saveCard":true,"email":"perchik@cat.com","metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, '');
      strictEqual(charge.sourceMetadata, '');
    });

    it('should complete charge and increase balance', async () => {
      const secret = await service.redis.hget('stripe:webhook:charge', 'secret');
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

      const charge = await service.redis.hgetall(`charge:${successChargeId}`);

      strictEqual(charge.id, successChargeId);
      strictEqual(charge.amount, '1001');
      strictEqual(charge.description, 'Feed the cat');
      strictEqual(charge.owner, this.user0.user.id);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '2');
      strictEqual(charge.failReason, '');
      strictEqual(charge.metadata, `{"owner":"${this.user0.user.id}","amount":1001,"description":"Feed the cat",`
        + '"saveCard":true,"email":"perchik@cat.com","metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, 'ch_1EKvTOAbVbjCtGTWjanopixO');
      strictEqual(charge.sourceMetadata !== '', true);

      const balance = await service.redis.get(`${this.user0.user.id}:balance`);

      strictEqual(balance, '1001');
    });

    it('should create failed stripe charge', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/charge/stripe/create',
        body: {
          token: 'tok_cvcCheckFail',
          amount: 100002,
          description: 'Feed the cat!!!!' },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(isUUIDv4(response.data.id), true);
      strictEqual(response.data.type, 'charge');
      strictEqual(response.data.attributes.amount, 100002);
      strictEqual(response.data.attributes.description, 'Feed the cat!!!!');
      strictEqual(response.data.attributes.status, 0);
      strictEqual(response.data.attributes.createAt !== undefined, true);
      strictEqual(response.data.attributes.owner, 'user0');
      strictEqual(response.data.attributes.failReason, '');

      failChargeId = response.data.id;

      const charge = await service.redis.hgetall(`charge:${failChargeId}`);

      strictEqual(charge.id, failChargeId);
      strictEqual(charge.amount, '100002');
      strictEqual(charge.description, 'Feed the cat!!!!');
      strictEqual(charge.owner, this.user0.user.id);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '0');
      strictEqual(charge.failReason, '');
      strictEqual(charge.metadata, `{"owner":"${this.user0.user.id}","amount":100002,"description":"Feed the cat!!!!",`
        + '"saveCard":false,"metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, '');
      strictEqual(charge.sourceMetadata, '');
    });

    it('should fail charge', async () => {
      const secret = await service.redis.hget('stripe:webhook:charge', 'secret');
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

      const charge = await service.redis.hgetall(`charge:${failChargeId}`);

      strictEqual(charge.id, failChargeId);
      strictEqual(charge.amount, '100002');
      strictEqual(charge.description, 'Feed the cat!!!!');
      strictEqual(charge.owner, this.user0.user.id);
      strictEqual(charge.createAt !== undefined, true);
      strictEqual(charge.status, '1');
      strictEqual(charge.failReason, 'Your card\'s security code is incorrect.');
      strictEqual(charge.metadata, `{"owner":"${this.user0.user.id}","amount":100002,"description":"Feed the cat!!!!",`
        + '"saveCard":false,"metadata":{}}');
      strictEqual(charge.source, 'stripe');
      strictEqual(charge.sourceId, 'ch_1ELBVGAbVbjCtGTWMdFR7AYA');
      strictEqual(charge.sourceMetadata !== '', true);

      const balance = await service.redis.get(`${this.user0.user.id}:balance`);

      // NOTE: did not change
      strictEqual(balance, '1001');
    });
  });

  describe('list action', () => {
    describe('http', () => {
      it('should return error if not admin', async () => {
        const response = await request.get({
          url: 'http://localhost:3000/payments/charge/list',
          qs: { owner: 'admin0' },
          headers: makeHeader(this.user0.jwt),
          simple: false });

        strictEqual(response, '{"statusCode":403,"error":"Forbidden","message":"not enough rights","name":"HttpStatusError"}');
      });

      it('should be able to get charges list by user', async () => {
        const response = await request.get({
          url: 'http://localhost:3000/payments/charge/list',
          qs: { owner: 'user0' },
          headers: makeHeader(this.user0.jwt),
          json: true });

        strictEqual(response.meta.offset, 0);
        strictEqual(response.meta.limit, 20);
        strictEqual(response.meta.cursor, 20);
        strictEqual(response.meta.page, 1);
        strictEqual(response.meta.pages, 1);

        strictEqual(response.data.length, 2);

        strictEqual(response.data[0].id, failChargeId);
        strictEqual(response.data[0].type, 'charge');
        strictEqual(response.data[0].attributes.amount, '100002');
        strictEqual(response.data[0].attributes.description, 'Feed the cat!!!!');
        strictEqual(response.data[0].attributes.owner, 'user0');
        strictEqual(response.data[0].attributes.createAt !== undefined, true);
        strictEqual(response.data[0].attributes.status, '1');
        strictEqual(response.data[0].attributes.failReason, 'Your card\'s security code is incorrect.');
        strictEqual(response.data[0].attributes.metadata === undefined, true);
        strictEqual(response.data[0].attributes.source === undefined, true);
        strictEqual(response.data[0].attributes.sourceId === undefined, true);
        strictEqual(response.data[0].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[0].attributes.failMetadata === undefined, true);

        strictEqual(response.data[1].id, successChargeId);
        strictEqual(response.data[1].type, 'charge');
        strictEqual(response.data[1].attributes.amount, '1001');
        strictEqual(response.data[1].attributes.description, 'Feed the cat');
        strictEqual(response.data[1].attributes.owner, 'user0');
        strictEqual(response.data[1].attributes.createAt !== undefined, true);
        strictEqual(response.data[1].attributes.status, '2');
        strictEqual(response.data[1].attributes.failReason, '');
        strictEqual(response.data[1].attributes.metadata === undefined, true);
        strictEqual(response.data[1].attributes.source === undefined, true);
        strictEqual(response.data[1].attributes.sourceId === undefined, true);
        strictEqual(response.data[1].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[1].attributes.failMetadata === undefined, true);
      });

      it('should be able to get charges list by admin', async () => {
        const response = await request.get({
          url: 'http://localhost:3000/payments/charge/list',
          qs: { owner: 'user0' },
          headers: makeHeader(this.admin0.jwt),
          json: true });

        strictEqual(response.meta.offset, 0);
        strictEqual(response.meta.limit, 20);
        strictEqual(response.meta.cursor, 20);
        strictEqual(response.meta.page, 1);
        strictEqual(response.meta.pages, 1);

        strictEqual(response.data.length, 2);

        strictEqual(response.data[0].id, failChargeId);
        strictEqual(response.data[0].type, 'charge');
        strictEqual(response.data[0].attributes.amount, '100002');
        strictEqual(response.data[0].attributes.description, 'Feed the cat!!!!');
        strictEqual(response.data[0].attributes.owner, 'user0');
        strictEqual(response.data[0].attributes.createAt !== undefined, true);
        strictEqual(response.data[0].attributes.status, '1');
        strictEqual(response.data[0].attributes.failReason, 'Your card\'s security code is incorrect.');
        strictEqual(response.data[0].attributes.metadata === undefined, true);
        strictEqual(response.data[0].attributes.source === undefined, true);
        strictEqual(response.data[0].attributes.sourceId === undefined, true);
        strictEqual(response.data[0].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[0].attributes.failMetadata === undefined, true);

        strictEqual(response.data[1].id, successChargeId);
        strictEqual(response.data[1].type, 'charge');
        strictEqual(response.data[1].attributes.amount, '1001');
        strictEqual(response.data[1].attributes.description, 'Feed the cat');
        strictEqual(response.data[1].attributes.owner, 'user0');
        strictEqual(response.data[1].attributes.createAt !== undefined, true);
        strictEqual(response.data[1].attributes.status, '2');
        strictEqual(response.data[1].attributes.failReason, '');
        strictEqual(response.data[1].attributes.metadata === undefined, true);
        strictEqual(response.data[1].attributes.source === undefined, true);
        strictEqual(response.data[1].attributes.sourceId === undefined, true);
        strictEqual(response.data[1].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[1].attributes.failMetadata === undefined, true);
      });
    });

    describe('amqp', () => {
      it('should return error if not admin', async () => {
        const error = await service.amqp
          .publishAndWait(
            'payments.charge.list',
            { owner: 'admin0' },
            { headers: makeHeader(this.user0.jwt) }
          )
          .reflect()
          .then(inspectPromise(false));

        strictEqual(error.statusCode, 403);
        strictEqual(error.message, 'not enough rights');
        strictEqual(error.name, 'HttpStatusError');
      });

      it('should be able to get charges list by user', async () => {
        const response = await service.amqp.publishAndWait(
          'payments.charge.list',
          { owner: 'user0' },
          { headers: makeHeader(this.user0.jwt) }
        );

        strictEqual(response.meta.offset, 0);
        strictEqual(response.meta.limit, 20);
        strictEqual(response.meta.cursor, 20);
        strictEqual(response.meta.page, 1);
        strictEqual(response.meta.pages, 1);

        strictEqual(response.data.length, 2);

        strictEqual(response.data[0].id, failChargeId);
        strictEqual(response.data[0].type, 'charge');
        strictEqual(response.data[0].attributes.amount, '100002');
        strictEqual(response.data[0].attributes.description, 'Feed the cat!!!!');
        strictEqual(response.data[0].attributes.owner, 'user0');
        strictEqual(response.data[0].attributes.createAt !== undefined, true);
        strictEqual(response.data[0].attributes.status, '1');
        strictEqual(response.data[0].attributes.failReason, 'Your card\'s security code is incorrect.');
        strictEqual(response.data[0].attributes.metadata === undefined, true);
        strictEqual(response.data[0].attributes.source === undefined, true);
        strictEqual(response.data[0].attributes.sourceId === undefined, true);
        strictEqual(response.data[0].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[0].attributes.failMetadata === undefined, true);

        strictEqual(response.data[1].id, successChargeId);
        strictEqual(response.data[1].type, 'charge');
        strictEqual(response.data[1].attributes.amount, '1001');
        strictEqual(response.data[1].attributes.description, 'Feed the cat');
        strictEqual(response.data[1].attributes.owner, 'user0');
        strictEqual(response.data[1].attributes.createAt !== undefined, true);
        strictEqual(response.data[1].attributes.status, '2');
        strictEqual(response.data[1].attributes.failReason, '');
        strictEqual(response.data[1].attributes.metadata === undefined, true);
        strictEqual(response.data[1].attributes.source === undefined, true);
        strictEqual(response.data[1].attributes.sourceId === undefined, true);
        strictEqual(response.data[1].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[1].attributes.failMetadata === undefined, true);
      });

      it('should be able to get charges list by admin', async () => {
        const response = await service.amqp.publishAndWait(
          'payments.charge.list',
          { owner: 'user0' },
          { headers: makeHeader(this.admin0.jwt) }
        );

        strictEqual(response.meta.offset, 0);
        strictEqual(response.meta.limit, 20);
        strictEqual(response.meta.cursor, 20);
        strictEqual(response.meta.page, 1);
        strictEqual(response.meta.pages, 1);

        strictEqual(response.data.length, 2);

        strictEqual(response.data[0].id, failChargeId);
        strictEqual(response.data[0].type, 'charge');
        strictEqual(response.data[0].attributes.amount, '100002');
        strictEqual(response.data[0].attributes.description, 'Feed the cat!!!!');
        strictEqual(response.data[0].attributes.owner, 'user0');
        strictEqual(response.data[0].attributes.createAt !== undefined, true);
        strictEqual(response.data[0].attributes.status, '1');
        strictEqual(response.data[0].attributes.failReason, 'Your card\'s security code is incorrect.');
        strictEqual(response.data[0].attributes.metadata === undefined, true);
        strictEqual(response.data[0].attributes.source === undefined, true);
        strictEqual(response.data[0].attributes.sourceId === undefined, true);
        strictEqual(response.data[0].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[0].attributes.failMetadata === undefined, true);

        strictEqual(response.data[1].id, successChargeId);
        strictEqual(response.data[1].type, 'charge');
        strictEqual(response.data[1].attributes.amount, '1001');
        strictEqual(response.data[1].attributes.description, 'Feed the cat');
        strictEqual(response.data[1].attributes.owner, 'user0');
        strictEqual(response.data[1].attributes.createAt !== undefined, true);
        strictEqual(response.data[1].attributes.status, '2');
        strictEqual(response.data[1].attributes.failReason, '');
        strictEqual(response.data[1].attributes.metadata === undefined, true);
        strictEqual(response.data[1].attributes.source === undefined, true);
        strictEqual(response.data[1].attributes.sourceId === undefined, true);
        strictEqual(response.data[1].attributes.sourceMetadata === undefined, true);
        strictEqual(response.data[1].attributes.failMetadata === undefined, true);
      });
    });
  });

  describe('get action', () => {
    it('should return error if not admin', async () => {
      const charge = await service.charge.create('stripe', this.admin0.user.id, 100, 'test');

      const response = await request.get({
        url: 'http://localhost:3000/payments/charge/get',
        qs: { id: charge.id },
        headers: makeHeader(this.user0.jwt),
        simple: false });

      strictEqual(response, '{"statusCode":403,"error":"Forbidden","message":"not enough rights","name":"HttpStatusError"}');
    });

    it('should be able to get charge by user', async () => {
      const response = await request.get({
        url: 'http://localhost:3000/payments/charge/get',
        qs: { id: successChargeId },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response.data.id, successChargeId);
      strictEqual(response.data.type, 'charge');
      strictEqual(response.data.attributes.amount, '1001');
      strictEqual(response.data.attributes.description, 'Feed the cat');
      strictEqual(response.data.attributes.owner, '[[protected]]');
      strictEqual(response.data.attributes.createAt !== undefined, true);
      strictEqual(response.data.attributes.status, 2);
      strictEqual(response.data.attributes.failReason, '');
      strictEqual(response.data.attributes.metadata === undefined, true);
      strictEqual(response.data.attributes.source === undefined, true);
      strictEqual(response.data.attributes.sourceId === undefined, true);
      strictEqual(response.data.attributes.sourceMetadata === undefined, true);
      strictEqual(response.data.attributes.failMetadata === undefined, true);
    });

    it('should be able to get charge by admin', async () => {
      const response = await request.get({
        url: 'http://localhost:3000/payments/charge/get',
        qs: { id: failChargeId },
        headers: makeHeader(this.admin0.jwt),
        json: true });

      strictEqual(response.data.id, failChargeId);
      strictEqual(response.data.type, 'charge');
      strictEqual(response.data.attributes.amount, '100002');
      strictEqual(response.data.attributes.description, 'Feed the cat!!!!');
      strictEqual(response.data.attributes.owner, '[[protected]]');
      strictEqual(response.data.attributes.createAt !== undefined, true);
      strictEqual(response.data.attributes.status, 1);
      strictEqual(response.data.attributes.failReason, 'Your card\'s security code is incorrect.');
      strictEqual(response.data.attributes.metadata === undefined, true);
      strictEqual(response.data.attributes.source === undefined, true);
      strictEqual(response.data.attributes.sourceId === undefined, true);
      strictEqual(response.data.attributes.sourceMetadata === undefined, true);
      strictEqual(response.data.attributes.failMetadata === undefined, true);
    });
  });
});
