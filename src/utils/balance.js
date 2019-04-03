const isObject = require('lodash/isObject');
const { strictEqual } = require('assert');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertInteger = require('./asserts/integer');

class Balance {
  static redisKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:balance`;
  }

  constructor(redis) {
    strictEqual(isObject(redis), true, 'redis is invalid');

    this.redis = redis;
  }

  async get(owner) {
    const value = await this.redis.get(Balance.redisKey(owner));

    if (value !== null) {
      const balance = Number(value);

      assertInteger(balance, 'balance is invalid');

      return balance;
    }

    return 0;
  }

  // eslint-disable-next-line class-methods-use-this
  async increment(owner, amount, pipeline) {
    assertInteger(amount, 'amount is invalid');
    strictEqual(isObject(pipeline), true, 'redis pipeline is invalid');

    pipeline.incrby(Balance.redisKey(owner), amount);
  }
}

module.exports = Balance;
