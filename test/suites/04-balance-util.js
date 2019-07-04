const assert = require('assert');

const randomOwner = require('../helpers/random-owner');

describe('balance utils', function suite() {
  const Payments = require('../../src');
  const Balance = require('../../src/utils/balance');
  const service = new Payments();

  before('start service', () => service.connect());

  it('should throw error if params for redis keys are invalid', () => {
    assert.throws(() => Balance.userBalanceKey(12345), { message: 'owner is invalid' });
    assert.throws(() => Balance.userBalanceKey(''), { message: 'owner is invalid' });
    assert.throws(() => Balance.userBalanceIncrementIdempotencyKey(12345), { message: 'owner is invalid' });
    assert.throws(() => Balance.userBalanceIncrementIdempotencyKey(''), { message: 'owner is invalid' });
    assert.throws(() => Balance.userBalanceDecrementIdempotencyKey(12345), { message: 'owner is invalid' });
    assert.throws(() => Balance.userBalanceDecrementIdempotencyKey(''), { message: 'owner is invalid' });
    assert.throws(() => Balance.userBalanceGoalKey(12345), { message: 'owner is invalid' });
    assert.throws(() => Balance.userBalanceGoalKey(''), { message: 'owner is invalid' });
  });

  it('should return keys for redis', () => {
    assert.strictEqual(Balance.userBalanceKey('12345'), '12345:balance');
    assert.strictEqual(Balance.userBalanceIncrementIdempotencyKey('12345'), '12345:balance:increment:idempotency');
    assert.strictEqual(Balance.userBalanceDecrementIdempotencyKey('12345'), '12345:balance:decrement:idempotency');
    assert.strictEqual(Balance.userBalanceGoalKey('12345'), '12345:balance:goal');
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

    await service.redis.set(Balance.userBalanceKey(owner), 123);

    assert.strictEqual(await balance.get(owner), 123);
  });

  it('should throw error if account balance was corrupted', async () => {
    const balance = new Balance(service.redis);
    const owner = randomOwner();

    await service.redis.set(Balance.userBalanceKey(owner), 'perchik is a fat cat');

    await assert.rejects(balance.get(owner), { message: 'balance is invalid' });
  });

  it('should throw error if params for increment are invalid', async () => {
    const balance = new Balance(service.redis);
    const owner = randomOwner();

    await assert.rejects(balance.increment(12345, 100, 't:12345', 'g:12345'), { message: 'owner is invalid' });
    await assert.rejects(balance.increment(owner, 100.01, 't:12345', 'g:12345'), { message: 'amount is invalid' });
    await assert.rejects(balance.increment(owner, '100', 't:12345', 'g:12345'), { message: 'amount is invalid' });
    await assert.rejects(balance.increment(owner, 100), { message: 'idempotency is invalid' });
    await assert.rejects(balance.increment(owner, 100, ''), { message: 'idempotency is invalid' });
    await assert.rejects(balance.increment(owner, 100, 't:12345'), { message: 'goal is invalid' });
    await assert.rejects(balance.increment(owner, 100, 't:12345', ''), { message: 'goal is invalid' });
    await assert.rejects(balance.increment(owner, 100, 't:12345', 'g:12345', 'pipeline'), { message: 'redis pipeline is invalid' });
  });

  it('should increment account balance', async () => {
    const balance = new Balance(service.redis);
    const owner = randomOwner();

    // 1
    await balance.increment(owner, 10001, 't:10001', 'g:10001');

    assert.strictEqual(await balance.get(owner), 10001);

    assert.strictEqual(await service.redis.get(`${owner}:balance`), '10001');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10001'), '10001');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:goal`, 'g:10001'), '10001');

    // 2
    await assert.rejects(balance.increment(owner, 10002, 't:10001', 'g:10001'), { message: '409' });

    assert.strictEqual(await balance.get(owner), 10001);

    assert.strictEqual(await service.redis.get(`${owner}:balance`), '10001');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10001'), '10001');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:goal`, 'g:10001'), '10001');

    // 3
    await balance.increment(owner, 10002, 't:10002', 'g:10001');

    assert.strictEqual(await balance.get(owner), 20003);

    assert.strictEqual(await service.redis.get(`${owner}:balance`), '20003');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10001'), '10001');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10002'), '10002');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:goal`, 'g:10001'), '20003');
  });

  it('should increment account balance using pipeline', async () => {
    const balance = new Balance(service.redis);
    const pipeline = service.redis.pipeline();
    const owner = randomOwner();

    await balance.increment(owner, 10001, 't:10001', 'g:10001', pipeline);
    await pipeline.exec();

    assert.strictEqual(await balance.get(owner), 10001);
  });

  it('should decrement account balance', async () => {
    const balance = new Balance(service.redis);
    const owner = randomOwner();

    await balance.increment(owner, 200, 't:10001', 'g:10001');

    // 1 wrong goal
    await assert.rejects(balance.decrement(owner, 200, 't:10001', 'g:10002'), { message: '409' });

    assert.strictEqual(await balance.get(owner), 200);

    assert.strictEqual(await service.redis.get(`${owner}:balance`), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10001'), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:decrement:idempotency`, 't:10001'), null);
    assert.strictEqual(await service.redis.hget(`${owner}:balance:goal`, 'g:10001'), '200');

    // 2 wrong goal amount
    await assert.rejects(balance.decrement(owner, 100, 't:10001', 'g:10001'), { message: '409' });

    assert.strictEqual(await balance.get(owner), 200);

    assert.strictEqual(await service.redis.get(`${owner}:balance`), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10001'), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:decrement:idempotency`, 't:10001'), null);
    assert.strictEqual(await service.redis.hget(`${owner}:balance:goal`, 'g:10001'), '200');

    // 3 decrement
    await balance.decrement(owner, 200, 't:10001', 'g:10001');

    assert.strictEqual(await balance.get(owner), 0);

    assert.strictEqual(await service.redis.get(`${owner}:balance`), '0');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10001'), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:decrement:idempotency`, 't:10001'), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:goal`, 'g:10001'), null);

    // 4 wrong idempotency
    await assert.rejects(balance.decrement(owner, 200, 't:10001', 'g:10001'), { message: '409' });

    assert.strictEqual(await balance.get(owner), 0);

    assert.strictEqual(await service.redis.get(`${owner}:balance`), '0');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:increment:idempotency`, 't:10001'), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:decrement:idempotency`, 't:10001'), '200');
    assert.strictEqual(await service.redis.hget(`${owner}:balance:goal`, 'g:10001'), null);
  });

  it('should decrement account balance using pipeline', async () => {
    const balance = new Balance(service.redis);
    const pipeline = service.redis.pipeline();
    const owner = randomOwner();

    await balance.increment(owner, 10001, 't:10001', 'g:10001');

    await balance.decrement(owner, 10001, 't:10001', 'g:10001', pipeline);
    await pipeline.exec();

    assert.strictEqual(await balance.get(owner), 0);
  });
});
