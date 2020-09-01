const { strictEqual, deepStrictEqual } = require('assert');
const request = require('request-promise');
const uuid = require('uuid/v4');
const Promise = require('bluebird');

describe('stripe', function suite() {
  const Payments = require('../../src');
  const { getToken, makeHeader } = require('../helpers/auth');
  const currentMonth = String(new Date().getMonth() + 1);

  const service = new Payments({ stripe: { enabled: true } });

  before('start service', () => service.connect());
  before('login users', async () => {
    this.user0 = (await getToken.call(service, 'user0@test.com'));
  });
  before('remove stripe data from redis', async () => {
    const keys = service.redis.keys('*stripe*').map((key) => service.redis.del(key.replace('{ms-payments}', '')));

    return Promise.all(keys);
  });
  before('remove user metadata', async () => service.users
    .setMetadata(this.user0.user.id, service.users.paymentAudience, { $remove: ['stripeInternalCustomerId'] }));

  let paymentMethodId1;
  let paymentMethodId2;
  let paymentMethodId3;

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
      // 1. Internal customer is not created yet
      const response1 = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents/create',
        body: {},
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response1.data.id !== undefined, true);
      strictEqual(response1.data.type, 'stripe-payment-intent');
      strictEqual(response1.data.attributes.clientSecret.startsWith('seti_'), true);

      const paymentsMetadata1 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata1['*.payments'].stripeInternalCustomerId !== undefined, true);

      const redisData1 = await service.redis.hgetall(
        `${paymentsMetadata1['*.payments'].stripeInternalCustomerId}:stripe:customer`
      );

      strictEqual(redisData1.email, 'user0@test.com');
      strictEqual(redisData1.id === paymentsMetadata1['*.payments'].stripeInternalCustomerId, true);
      strictEqual(redisData1.updatedAt !== undefined, true);
      strictEqual(redisData1.createdAt !== undefined, true);
      strictEqual(redisData1.metadata !== undefined, true);
      strictEqual(redisData1.name, 'Im User0');
      strictEqual(redisData1.stripeId.startsWith('cus_'), true);

      // 2. Internal customer is created
      const response2 = await request.post({
        url: 'http://localhost:3000/payments/stripe/setup-intents/create',
        body: {},
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response2.data.id !== undefined, true);
      strictEqual(response2.data.type, 'stripe-payment-intent');
      strictEqual(response2.data.attributes.clientSecret.startsWith('seti_'), true);

      const paymentsMetadata2 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata2['*.payments'].stripeInternalCustomerId !== undefined, true);
      strictEqual(
        paymentsMetadata1['*.payments'].stripeInternalCustomerId
          === paymentsMetadata2['*.payments'].stripeInternalCustomerId,
        true
      );

      const redisData2 = await service.redis.hgetall(
        `${paymentsMetadata2['*.payments'].stripeInternalCustomerId}:stripe:customer`
      );

      strictEqual(redisData2.email, 'user0@test.com');
      strictEqual(redisData2.id === paymentsMetadata2['*.payments'].stripeInternalCustomerId, true);
      strictEqual(redisData2.updatedAt !== undefined, true);
      strictEqual(redisData2.createdAt !== undefined, true);
      strictEqual(redisData2.metadata !== undefined, true);
      strictEqual(redisData2.name, 'Im User0');
      strictEqual(redisData2.stripeId.startsWith('cus_'), true);
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
      // 1. There are not payment methods yet,
      //    should create payment method and set it as default
      const response1 = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/attach',
        body: { paymentMethod: 'pm_card_authenticationRequired' },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response1.data.id !== undefined, true);
      strictEqual(response1.data.type, 'payment-method-stripe-card');
      strictEqual(response1.data.attributes.cardBrand, 'visa');
      strictEqual(response1.data.attributes.cardLast4, '3184');
      strictEqual(response1.data.attributes.cardExpMonth, currentMonth);
      strictEqual(response1.data.attributes.cardExpYear, '2021');
      strictEqual(response1.data.attributes.cardholderName, '');

      const paymentsMetadata1 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata1['*.payments'].stripeInternalCustomerId !== undefined, true);
      strictEqual(paymentsMetadata1['*.payments'].stripeDefaultPaymentMethodId === response1.data.id, true);

      const redisCollectionData1 = await service.redis.zrange(
        `${paymentsMetadata1['*.payments'].stripeInternalCustomerId}:stripe:payment:methods`, 0, -1
      );

      deepStrictEqual(redisCollectionData1, [response1.data.id]);

      const redisObjectData1 = await service.redis.hgetall(
        `stripe:payment:methods:data:${response1.data.id}`
      );

      strictEqual(redisObjectData1.id, response1.data.id);
      strictEqual(redisObjectData1.cardBrand, 'visa');
      strictEqual(redisObjectData1.cardLast4, '3184');
      strictEqual(redisObjectData1.cardExpMonth, currentMonth);
      strictEqual(redisObjectData1.cardExpYear, '2021');
      strictEqual(redisObjectData1.cardholderName, '');
      strictEqual(redisObjectData1.cardholderPhone, '');
      strictEqual(redisObjectData1.cardholderEmail, '');
      strictEqual(redisObjectData1.updatedAt !== undefined, true);
      strictEqual(redisObjectData1.createdAt !== undefined, true);
      strictEqual(redisObjectData1.metadata !== undefined, true);
      strictEqual(redisObjectData1.stripeId.startsWith('pm_'), true);

      // 2. Default payment method is setted,
      //    should create payment method and set it as default
      const response2 = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/attach',
        body: { paymentMethod: 'pm_card_mastercard', useAsDefault: true },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response2.data.id !== undefined, true);
      strictEqual(response2.data.type, 'payment-method-stripe-card');
      strictEqual(response2.data.attributes.cardBrand, 'mastercard');
      strictEqual(response2.data.attributes.cardLast4, '4444');
      strictEqual(response2.data.attributes.cardExpMonth, currentMonth);
      strictEqual(response2.data.attributes.cardExpYear, '2021');
      strictEqual(response2.data.attributes.cardholderName, '');

      const paymentsMetadata2 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata2['*.payments'].stripeInternalCustomerId !== undefined, true);
      strictEqual(paymentsMetadata2['*.payments'].stripeDefaultPaymentMethodId === response2.data.id, true);

      const redisCollectionData2 = await service.redis.zrange(
        `${paymentsMetadata2['*.payments'].stripeInternalCustomerId}:stripe:payment:methods`, 0, -1
      );

      deepStrictEqual(redisCollectionData2, [response1.data.id, response2.data.id]);

      const redisObjectData2 = await service.redis.hgetall(
        `stripe:payment:methods:data:${response2.data.id}`
      );

      strictEqual(redisObjectData2.id, response2.data.id);
      strictEqual(redisObjectData2.cardBrand, 'mastercard');
      strictEqual(redisObjectData2.cardLast4, '4444');
      strictEqual(redisObjectData2.cardExpMonth, currentMonth);
      strictEqual(redisObjectData2.cardExpYear, '2021');
      strictEqual(redisObjectData2.cardholderName, '');
      strictEqual(redisObjectData2.cardholderPhone, '');
      strictEqual(redisObjectData2.cardholderEmail, '');
      strictEqual(redisObjectData2.updatedAt !== undefined, true);
      strictEqual(redisObjectData2.createdAt !== undefined, true);
      strictEqual(redisObjectData2.metadata !== undefined, true);
      strictEqual(redisObjectData2.stripeId.startsWith('pm_'), true);

      // 3. Default payment method is setted,
      //    should create payment method and don't affect default payment method
      const response3 = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/attach',
        body: { paymentMethod: 'pm_card_authenticationRequiredOnSetup', useAsDefault: false },
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response3.data.id !== undefined, true);
      strictEqual(response3.data.type, 'payment-method-stripe-card');
      strictEqual(response3.data.attributes.cardBrand, 'visa');
      strictEqual(response3.data.attributes.cardLast4, '3155');
      strictEqual(response3.data.attributes.cardExpMonth, currentMonth);
      strictEqual(response3.data.attributes.cardExpYear, '2021');
      strictEqual(response3.data.attributes.cardholderName, '');

      const paymentsMetadata3 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata3['*.payments'].stripeInternalCustomerId !== undefined, true);
      // NOTE stripeDefaultPaymentMethodId === response2
      strictEqual(paymentsMetadata3['*.payments'].stripeDefaultPaymentMethodId === response2.data.id, true);

      const redisCollectionData3 = await service.redis.zrange(
        `${paymentsMetadata3['*.payments'].stripeInternalCustomerId}:stripe:payment:methods`, 0, -1
      );

      deepStrictEqual(redisCollectionData3, [response1.data.id, response2.data.id, response3.data.id]);

      const redisObjectData3 = await service.redis.hgetall(
        `stripe:payment:methods:data:${response3.data.id}`
      );

      strictEqual(redisObjectData3.id, response3.data.id);
      strictEqual(redisObjectData3.cardBrand, 'visa');
      strictEqual(redisObjectData3.cardLast4, '3155');
      strictEqual(redisObjectData3.cardExpMonth, currentMonth);
      strictEqual(redisObjectData3.cardExpYear, '2021');
      strictEqual(redisObjectData3.cardholderName, '');
      strictEqual(redisObjectData3.cardholderPhone, '');
      strictEqual(redisObjectData3.cardholderEmail, '');
      strictEqual(redisObjectData3.updatedAt !== undefined, true);
      strictEqual(redisObjectData3.createdAt !== undefined, true);
      strictEqual(redisObjectData3.metadata !== undefined, true);
      strictEqual(redisObjectData3.stripeId.startsWith('pm_'), true);

      paymentMethodId1 = response1.data.id;
      paymentMethodId2 = response2.data.id;
      paymentMethodId3 = response3.data.id;
    });
  });

  describe('payment-methods/list action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.get({
        url: 'http://localhost:3000/payments/stripe/payment-methods/list',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    it('should return list of payment methods', async () => {
      const response = await request.get({
        url: 'http://localhost:3000/payments/stripe/payment-methods/list',
        headers: makeHeader(this.user0.jwt),
        json: true });

      strictEqual(response.meta.defaultPaymentMethodId, paymentMethodId2);

      strictEqual(response.data[0].id, paymentMethodId1);
      strictEqual(response.data[0].type, 'payment-method-stripe-card');
      strictEqual(response.data[0].attributes.cardBrand, 'visa');
      strictEqual(response.data[0].attributes.cardLast4, '3184');
      strictEqual(response.data[0].attributes.cardExpMonth, currentMonth);
      strictEqual(response.data[0].attributes.cardExpYear, '2021');
      strictEqual(response.data[0].attributes.cardholderName, '');

      strictEqual(response.data[1].id, paymentMethodId2);
      strictEqual(response.data[1].type, 'payment-method-stripe-card');
      strictEqual(response.data[1].attributes.cardBrand, 'mastercard');
      strictEqual(response.data[1].attributes.cardLast4, '4444');
      strictEqual(response.data[1].attributes.cardExpMonth, currentMonth);
      strictEqual(response.data[1].attributes.cardExpYear, '2021');
      strictEqual(response.data[1].attributes.cardholderName, '');

      strictEqual(response.data[2].id, paymentMethodId3);
      strictEqual(response.data[2].type, 'payment-method-stripe-card');
      strictEqual(response.data[2].attributes.cardBrand, 'visa');
      strictEqual(response.data[2].attributes.cardLast4, '3155');
      strictEqual(response.data[2].attributes.cardExpMonth, currentMonth);
      strictEqual(response.data[2].attributes.cardExpYear, '2021');
      strictEqual(response.data[2].attributes.cardholderName, '');
    });
  });

  describe('set-default action', () => {
    it('should return error if user not authorized', async () => {
      const response = await request.get({
        url: 'http://localhost:3000/payments/stripe/payment-methods/set-default',
        simple: false });

      strictEqual(response, '{"statusCode":401,"error":"Unauthorized","message":'
        + '"An attempt was made to perform an operation without authentication: '
        + 'Credentials Required","name":"AuthenticationRequiredError"}');
    });

    it('should return error if payment id not found', async () => {
      const id = uuid();
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/set-default',
        body: `{"id":"${id}"}`,
        headers: makeHeader(this.user0.jwt),
        simple: false });

      strictEqual(response, `{"statusCode":404,"error":"Not Found","message":"Payment method #${id}`
        + ' not found","name":"HttpStatusError"}');
    });

    it('should update default payment method', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/set-default',
        headers: makeHeader(this.user0.jwt),
        body: `{"id":"${paymentMethodId3}"}` });

      strictEqual(response, `{"meta":{"updated":true,"id":"${paymentMethodId3}"}}`);

      const paymentsMetadata = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata['*.payments'].stripeDefaultPaymentMethodId === paymentMethodId3, true);
    });

    it('should not update default payment method if already default', async () => {
      const response = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/set-default',
        headers: makeHeader(this.user0.jwt),
        body: `{"id":"${paymentMethodId3}"}` });

      strictEqual(response, `{"meta":{"updated":false,"id":"${paymentMethodId3}"}}`);

      const paymentsMetadata = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata['*.payments'].stripeDefaultPaymentMethodId === paymentMethodId3, true);
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

    it('should delete payment method', async () => {
      // 1. paymentMethodId3 is default payment method,
      //    should delete payment method and set another as default
      const response1 = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/delete',
        body: `{"id":"${paymentMethodId3}"}`,
        headers: makeHeader(this.user0.jwt) });

      strictEqual(response1, `{"meta":{"deleted":true,"id":"${paymentMethodId3}",`
        + `"stripeDefaultPaymentMethodId":"${paymentMethodId1}"}}`);

      const paymentsMetadata1 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata1['*.payments'].stripeDefaultPaymentMethodId === paymentMethodId1, true);

      const redisCollectionData1 = await service.redis.zrange(
        `${paymentsMetadata1['*.payments'].stripeInternalCustomerId}:stripe:payment:methods`, 0, -1
      );

      deepStrictEqual(redisCollectionData1, [paymentMethodId1, paymentMethodId2]);

      const redisObjectData1 = await service.redis.hgetall(
        `stripe:payment:methods:data:${paymentMethodId3}`
      );

      deepStrictEqual(redisObjectData1, {});

      // 2. paymentMethodId2 is not default payment method,
      //    should delete payment method and don't affect default
      const response2 = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/delete',
        body: `{"id":"${paymentMethodId2}"}`,
        headers: makeHeader(this.user0.jwt) });

      strictEqual(response2, `{"meta":{"deleted":true,"id":"${paymentMethodId2}",`
        + `"stripeDefaultPaymentMethodId":"${paymentMethodId1}"}}`);

      const paymentsMetadata2 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata2['*.payments'].stripeDefaultPaymentMethodId === paymentMethodId1, true);

      const redisCollectionData2 = await service.redis.zrange(
        `${paymentsMetadata1['*.payments'].stripeInternalCustomerId}:stripe:payment:methods`, 0, -1
      );

      deepStrictEqual(redisCollectionData2, [paymentMethodId1]);

      const redisObjectData2 = await service.redis.hgetall(
        `stripe:payment:methods:data:${paymentMethodId2}`
      );

      deepStrictEqual(redisObjectData2, {});

      // 3. paymentMethodId1 is not default payment method,
      //    should delete payment method and delete default payment method
      const response3 = await request.post({
        url: 'http://localhost:3000/payments/stripe/payment-methods/delete',
        body: `{"id":"${paymentMethodId1}"}`,
        headers: makeHeader(this.user0.jwt) });

      strictEqual(response3, `{"meta":{"deleted":true,"id":"${paymentMethodId1}",`
        + '"stripeDefaultPaymentMethodId":null}}');

      const paymentsMetadata3 = await service.amqp.publishAndWait(
        'users.getMetadata',
        { audience: '*.payments', username: this.user0.user.id }
      );

      strictEqual(paymentsMetadata3['*.payments'].stripeDefaultPaymentMethodId === undefined, true);

      const redisCollectionData3 = await service.redis.zrange(
        `${paymentsMetadata3['*.payments'].stripeInternalCustomerId}:stripe:payment:methods`, 0, -1
      );

      deepStrictEqual(redisCollectionData3, []);

      const redisObjectData3 = await service.redis.hgetall(
        `stripe:payment:methods:data:${paymentMethodId1}`
      );

      deepStrictEqual(redisObjectData3, {});
    });
  });
});
