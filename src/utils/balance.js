const isObject = require('lodash/isObject');
const { strictEqual } = require('assert');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertInteger = require('./asserts/integer');

class Balance {
  static userBalanceKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:balance`;
  }

  static userBalanceIncrementIdempotencyKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:balance:increment:idempotency`;
  }

  static userBalanceDecrementIdempotencyKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:balance:decrement:idempotency`;
  }

  static userBalanceGoalKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:balance:goal`;
  }

  constructor(redis) {
    strictEqual(isObject(redis), true, 'redis is invalid');

    this.redis = redis;
  }

  async get(owner) {
    const value = await this.redis.get(Balance.userBalanceKey(owner));

    if (value !== null) {
      const balance = Number(value);

      assertInteger(balance, 'balance is invalid');

      return balance;
    }

    return 0;
  }

  async increment(owner, amount, idempotency, goal, pipeline) {
    assertStringNotEmpty(owner, 'owner is invalid');
    assertInteger(amount, 'amount is invalid');
    assertStringNotEmpty(idempotency, 'idempotency is invalid');
    assertStringNotEmpty(goal, 'goal is invalid');

    const params = [
      3,
      Balance.userBalanceKey(owner),
      Balance.userBalanceIncrementIdempotencyKey(owner),
      Balance.userBalanceGoalKey(owner),
      amount,
      idempotency,
      goal,
    ];

    if (pipeline !== undefined) {
      strictEqual(isObject(pipeline), true, 'redis pipeline is invalid');

      pipeline.incrementBalance(...params);
    } else {
      await this.redis.incrementBalance(...params);
    }
  }

  async decrement(owner, amount, idempotency, goal, pipeline) {
    assertStringNotEmpty(owner, 'owner is invalid');
    assertInteger(amount, 'amount is invalid');
    assertStringNotEmpty(idempotency, 'idempotency is invalid');
    assertStringNotEmpty(goal, 'goal is invalid');

    const params = [
      3,
      Balance.userBalanceKey(owner),
      Balance.userBalanceDecrementIdempotencyKey(owner),
      Balance.userBalanceGoalKey(owner),
      amount,
      idempotency,
      goal,
    ];

    if (pipeline !== undefined) {
      strictEqual(isObject(pipeline), true, 'redis pipeline is invalid');

      pipeline.decrementBalance(...params);
    } else {
      await this.redis.decrementBalance(...params);
    }
  }
}

module.exports = Balance;
