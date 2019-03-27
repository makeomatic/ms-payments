const assert = require('assert');

const config = require('../config');

describe('balance', function suite() {
  const Payments = require('../../src');
  const { balanceRedisKey, getBalance } = require('../../src/utils/balance');

  before('start service', async () => {
    this.service = new Payments(config);
    await this.service.connect();
  });

  afterEach(() => this.service.redis.del(balanceRedisKey('12345')));

  describe('utils', () => {
    it('should throw error if params for balanceRedisKey are invalid', () => {
      assert.throws(() => balanceRedisKey(12345), { message: 'owner is invalid' });
      assert.throws(() => balanceRedisKey(''), { message: 'owner is invalid' });
    });

    it('should return a key for redis', () => {
      assert.strictEqual(balanceRedisKey('12345'), '12345:balance');
    });

    it('should throw error if params for getBalance are invalid', async () => {
      await assert.rejects(getBalance(this.service.redis, 12345), { message: 'owner is invalid' });
      await assert.rejects(getBalance(this.service.redis, ''), { message: 'owner is invalid' });
    });

    it('should return 0 if account balance is not set', async () => {
      assert.strictEqual(await getBalance(this.service.redis, '12345'), 0);
    });

    it('should return account balance', async () => {
      this.service.redis.set(balanceRedisKey('12345'), 49.51);

      assert.strictEqual(await getBalance(this.service.redis, '12345'), 49.51);
    });

    it('should throw error if account balance was corrupted', async () => {
      this.service.redis.set(balanceRedisKey('12345'), 'perchik is a fat cat');

      await assert.rejects(getBalance(this.service.redis, '12345'), { message: 'balance is invalid' });
    });
  });

  describe('actions', () => {
    it('should return error if owner is invalid', async () => {
      let error;

      try {
        await this.service.amqp.publishAndWait('payments.balance.get', { owner: '' });
      } catch (e) {
        error = e;
      }

      assert.strictEqual(error.message, 'balance.get validation failed: data.owner should NOT be shorter than 1 characters');

      try {
        await this.service.amqp.publishAndWait('payments.balance.get', { owner: 12345 });
      } catch (e) {
        error = e;
      }

      assert.strictEqual(error.message, 'balance.get validation failed: data.owner should be string');
    });

    it('should return 0 if account balance was not set', async () => {
      const response = await this.service.amqp.publishAndWait('payments.balance.get', { owner: '12345' });

      assert.strictEqual(response.balance, 0);
    });

    it('should return account balance', async () => {
      await this.service.redis.set(balanceRedisKey('12345'), 1449);

      const response = await this.service.amqp.publishAndWait('payments.balance.get', { owner: '12345' });

      assert.strictEqual(response.balance, 1449);
    });
  });
});
