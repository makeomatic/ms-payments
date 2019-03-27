const { strictEqual } = require('assert');
const uuid = require('uuid/v4');
const moment = require('moment');
const isObject = require('lodash/isObject');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertFinite = require('./asserts/finite');
const assertPlainObject = require('./asserts/plain-object');

class Charge {
  static listRedisKey(owner) {
    assertStringNotEmpty(owner, 'owner is invalid');

    return `${owner}:charges`;
  }

  static dataRedisKey(chargeId) {
    assertStringNotEmpty(chargeId, 'chargeId is invalid');

    return `charge:${chargeId}`;
  }

  constructor(redis) {
    strictEqual(isObject(redis), true, 'redis is invalid');

    this.redis = redis;
  }

  async create(source, owner, amount, description = '', meta = {}) {
    assertStringNotEmpty(source, 'source is invalid');
    assertStringNotEmpty(owner, 'owner is invalid');
    assertFinite(amount, 'amount is invalid');
    assertStringNotEmpty(description, 'description is invalid');
    assertPlainObject(meta, 'meta is invalid');

    const pipeline = this.redis.pipeline();
    const id = uuid();
    const charge = {
      id,
      source,
      owner,
      amount,
      description,
      createAt: moment().format(),
      metadata: JSON.stringify(meta),
      status: Charge.STATUS_INITIALIZED,
      sourceId: null,
      sourceMetadata: null,
      failReason: null,
      failMetadata: null,
    };

    pipeline.sadd(Charge.listRedisKey(owner), id);
    pipeline.hmset(Charge.dataRedisKey(id), charge);

    await pipeline.exec();

    return charge;
  }

  async markAsComplete(charge, sourceId, sourceMetadata, pipeline) {
    const { id, owner, amount } = charge;

    assertStringNotEmpty(id, 'charge id is invalid');
    assertStringNotEmpty(owner, 'owner is invalid');
    assertFinite(amount, 'amount is invalid');

    const updatedCharge = Object.assign({}, charge, {
      sourceId,
      sourceMetadata: JSON.stringify(sourceMetadata),
      status: Charge.STATUS_COMPLETED });

    if (pipeline !== undefined) {
      pipeline.hmset(Charge.dataRedisKey(charge.id), updatedCharge);
    } else {
      await this.redis.hmset(Charge.dataRedisKey(charge.id), updatedCharge);
    }

    return updatedCharge;
  }

  async markAsFailed(charge, failReason, failMetadata) {
    const updatedCharge = Object.assign({}, charge, {
      failReason,
      failMetadata: JSON.stringify(failMetadata),
      status: Charge.STATUS_FAILED,
    });

    await this.redis.hmset(Charge.dataRedisKey(charge.id), updatedCharge);

    return updatedCharge;
  }
}

Charge.STATUS_INITIALIZED = 0;
Charge.STATUS_FAILED = 1;
Charge.STATUS_COMPLETED = 2;

module.exports = Charge;
