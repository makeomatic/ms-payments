const assert = require('assert');
const request = require('request-promise');

const randomOwner = require('../../helpers/random-owner');
const { getToken, makeHeader } = require('../../helpers/auth');

describe('balance actions', function suite() {
  const Payments = require('../../../src');
  const Balance = require('../../../src/utils/balance');
  const service = new Payments();

  before('start service', () => service.connect());

  before(async () => {
    this.admin0 = (await getToken.call(service, 'test@test.ru'));
    this.user0 = (await getToken.call(service, 'user0@test.com'));
  });

  afterEach(() => service.redis.del(Balance.userBalanceKey(this.user0.user.id)));

  it('should return error if auth header is not present', async () => {
    const { body } = await request.get(
      'http://localhost:3000/payments/balance/get',
      { qs: { owner: 'user0' }, resolveWithFullResponse: true, simple: false }
    );

    assert.strictEqual(body, '{"statusCode":401,"error":"Unauthorized","message":"An attempt was made to perform'
      + ' an operation without authentication: Credentials Required","name":"AuthenticationRequiredError"}');
  });

  it('should return error if owner is empty string', async () => {
    const { body } = await request.get(
      'http://localhost:3000/payments/balance/get',
      { qs: { owner: '' }, headers: makeHeader(this.user0.jwt), resolveWithFullResponse: true, simple: false }
    );

    assert.strictEqual(body, '{"statusCode":400,"error":"Bad Request","message":"balance.get validation failed:'
      + ' data.owner should NOT be shorter than 1 characters","name":"HttpStatusError"}');
  });

  it('should return error if not admin', async () => {
    const { body } = await request.get(
      'http://localhost:3000/payments/balance/get',
      { qs: { owner: 'admin0' }, headers: makeHeader(this.user0.jwt), resolveWithFullResponse: true, simple: false }
    );

    assert.strictEqual(body, '{"statusCode":403,"error":"Forbidden","message":"not enough rights","name":"HttpStatusError"}');
  });

  it('should return error if owner does not exist', async () => {
    const { body } = await request.get(
      'http://localhost:3000/payments/balance/get',
      { qs: { owner: 'fat-cat' }, headers: makeHeader(this.admin0.jwt), resolveWithFullResponse: true, simple: false }
    );

    assert.strictEqual(body, '{"statusCode":404,"error":"Not Found","message":"user not found","name":"HttpStatusError"}');
  });

  it('should return 0 if account balance was not set', async () => {
    const { body } = await request.get(
      'http://localhost:3000/payments/balance/get',
      { headers: makeHeader(this.user0.jwt), resolveWithFullResponse: true, simple: false }
    );

    assert.strictEqual(body, '{"data":{"type":"balance","id":"user0","attributes":{"value":0}}}');
  });

  it('should return user balance requested by owner', async () => {
    await service.redis.set(Balance.userBalanceKey(this.user0.user.id), 1449);

    const { body } = await request.get(
      'http://localhost:3000/payments/balance/get',
      { headers: makeHeader(this.user0.jwt), resolveWithFullResponse: true, simple: false }
    );

    assert.strictEqual(body, '{"data":{"type":"balance","id":"user0","attributes":{"value":1449}}}');
  });

  it('should return user balance requested by admin', async () => {
    await service.redis.set(Balance.userBalanceKey(this.user0.user.id), 1448);

    const { body } = await request.get(
      'http://localhost:3000/payments/balance/get',
      { qs: { owner: 'user0' }, headers: makeHeader(this.admin0.jwt), resolveWithFullResponse: true, simple: false }
    );

    assert.strictEqual(body, '{"data":{"type":"balance","id":"user0","attributes":{"value":1448}}}');
  });

  it('should decrement balance', async () => {
    const owner = randomOwner();

    await service.balance.increment(owner, 99, 'icr#1', 'goal1');

    const response = await service.amqp.publishAndWait('payments.balance.decrement', {
      ownerId: owner,
      amount: 99,
      idempotency: 'decr#1',
      goal: 'goal1',
    });

    assert.strictEqual(response, 0);
    assert.strictEqual(await service.balance.get(owner), 0);
  });
});
