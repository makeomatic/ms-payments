const assert = require('assert');

const config = require('../config');
const randomOwner = require('../helpers/random-owner');

describe('balance utils', function suite() {
  const Payments = require('../../src');
  const Balance = require('../../src/utils/balance');
  const service = new Payments(config);

  before('start service', () => service.connect());

  it('should throw error if params for balanceRedisKey are invalid', () => {
    assert.throws(() => Balance.redisKey(12345), { message: 'owner is invalid' });
    assert.throws(() => Balance.redisKey(''), { message: 'owner is invalid' });
  });

  it('should return a key for redis', () => {
    assert.strictEqual(Balance.redisKey('12345'), '12345:balance');
  });

  it('should throw error if params for getBalance are invalid', async () => {
    const balance = new Balance(service.redis);

    await assert.rejects(balance.get(12345), { message: 'owner is invalid' });
    await assert.rejects(balance.get(''), { message: 'owner is invalid' });
  });

  it('should return 0 if account balance is not set', async () => {
    const balance = new Balance(service.redis);
    const owner = randomOwner();

    assert.strictEqual(await balance.get(owner), 0);
  });

  it('should return account balance', async () => {
    const balance = new Balance(service.redis);
    const owner = randomOwner();

    await service.redis.set(Balance.redisKey(owner), 123);

    assert.strictEqual(await balance.get(owner), 123);
  });

  it('should throw error if account balance was corrupted', async () => {
    const balance = new Balance(service.redis);
    const owner = randomOwner();

    await service.redis.set(Balance.redisKey(owner), 'perchik is a fat cat');

    await assert.rejects(balance.get(owner), { message: 'balance is invalid' });
  });

  it('should throw error if params for increment are invalid', async () => {
    const balance = new Balance(service.redis);
    const pipeline = service.redis.pipeline();
    const owner = randomOwner();

    await assert.rejects(balance.increment(12345, 100, pipeline), { message: 'owner is invalid' });
    await assert.rejects(balance.increment('', 100, pipeline), { message: 'owner is invalid' });
    await assert.rejects(balance.increment(owner, 100.01, pipeline), { message: 'amount is invalid' });
    await assert.rejects(balance.increment(owner, '100', pipeline), { message: 'amount is invalid' });
    await assert.rejects(balance.increment(owner, 100, 'pipeline'), { message: 'redis pipeline is invalid' });
  });

  it('should increment account balance', async () => {
    const balance = new Balance(service.redis);
    const pipeline = service.redis.pipeline();
    const owner = randomOwner();

    await balance.increment(owner, 10001, pipeline);
    await pipeline.exec();

    assert.strictEqual(await balance.get(owner), 10001);
  });
});
