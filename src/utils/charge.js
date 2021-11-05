const { strictEqual } = require('assert');
const uuid = require('uuid/v4');
const moment = require('moment');
const isObject = require('lodash/isObject');
const isNull = require('lodash/isNull');
const zipObject = require('lodash/zipObject');
const fsort = require('redis-filtered-sort');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertInteger = require('./asserts/integer');
const assertPlainObject = require('./asserts/plain-object');
const RedisMapper = require('./redis-mapper');

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
    this.mapper = new RedisMapper(redis);
  }

  async create(source, owner, amount, description = '', meta = {}) {
    assertStringNotEmpty(source, 'source is invalid');
    assertStringNotEmpty(owner, 'owner is invalid');
    assertInteger(amount, 'amount is invalid');
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
      createAtTimestamp: Date.now(),
      metadata: JSON.stringify(meta),
      status: Charge.STATUS_INITIALIZED,
      sourceId: '',
      sourceMetadata: '',
      failReason: '',
    };

    pipeline.sadd(Charge.listRedisKey(owner), id);
    pipeline.hmset(Charge.dataRedisKey(id), charge);

    await pipeline.exec();

    return charge;
  }

  async updateSource({ id, sourceId, sourceMetadata, ...rest }, pipeline) {
    assertStringNotEmpty(id, 'charge id is invalid');
    assertStringNotEmpty(sourceId, 'sourceId is invalid');
    assertPlainObject(sourceMetadata, 'sourceMetadata is invalid');

    const chargeUpdateData = {
      sourceId,
      sourceMetadata: JSON.stringify(sourceMetadata),
      ...rest,
    };

    if (pipeline !== undefined) {
      pipeline.hmset(Charge.dataRedisKey(id), chargeUpdateData);
    } else {
      await this.redis.hmset(Charge.dataRedisKey(id), chargeUpdateData);
    }
  }

  async markAsAuthorized(id, sourceId, sourceMetadata, pipeline) {
    const opts = {
      id,
      sourceId,
      sourceMetadata,
      status: Charge.STATUS_AUTHORIZED,
    };

    await this.updateSource(opts, pipeline);
  }

  async markAsComplete(id, sourceId, sourceMetadata, pipeline) {
    const opts = {
      id,
      sourceId,
      sourceMetadata,
      status: Charge.STATUS_COMPLETED,
    };

    await this.updateSource(opts, pipeline);
  }

  async markAsFailed(id, sourceId, sourceMetadata, failReason) {
    assertStringNotEmpty(failReason, 'failReason is invalid');

    const opts = {
      id,
      sourceId,
      failReason,
      sourceMetadata,
      status: Charge.STATUS_FAILED,
    };

    await this.updateSource(opts);
  }

  async markAsCanceled(id, sourceId, sourceMetadata, failReason) {
    assertStringNotEmpty(failReason, 'failReason is invalid');

    const opts = {
      id,
      sourceId,
      failReason,
      sourceMetadata,
      status: Charge.STATUS_CANCELED,
    };

    await this.updateSource(opts);
  }

  // NOTE: how to `fields` works
  // NOTE: does not safe for pagination, could return less results than expected
  async list(owner, offset, limit, fields = []) {
    assertStringNotEmpty(owner, 'owner is invalid');

    const result = await this.redis.fsort(
      Charge.listRedisKey(owner),
      Charge.dataRedisKey('*'),
      'createAtTimestamp',
      'DESC',
      fsort.filter({}),
      Date.now(),
      offset,
      limit
    );

    if (result.length < 2) {
      return [[], 0];
    }

    const pipeline = this.redis.pipeline();
    const total = Number(result.pop());

    for (const chargeId of result) {
      if (fields.length > 1) {
        pipeline.hmget(Charge.dataRedisKey(chargeId), fields);
      } else {
        pipeline.hgetall(Charge.dataRedisKey(chargeId));
      }
    }

    const data = await pipeline.exec();
    const charges = [];

    for (const [, chargeData] of data) {
      // eslint-disable-next-line no-nested-ternary
      const charge = fields.length > 1
        // I hope there is a more simple way to detect not found (and it is not lua script)
        ? (chargeData.every(isNull) ? null : zipObject(fields, chargeData))
        : (Object.keys(chargeData).length !== 0 ? chargeData : null);

      if (charge !== null) {
        charges.push(charge);
      }
    }

    return [charges, total];
  }

  async get(id, fields = []) {
    const charge = await this.mapper.get(Charge.dataRedisKey(id), fields);

    if (charge.status !== undefined) {
      charge.status = parseInt(charge.status, 10);
    }

    return charge;
  }

  static retreiveAuthorizationId(paypalPayment) {
    const [transaction] = paypalPayment.transactions;
    const [relatedResource] = transaction.related_resources;
    const { authorization } = relatedResource;
    return authorization.id;
  }
}

Charge.STATUS_INITIALIZED = 0;
Charge.STATUS_AUTHORIZED = 4;
Charge.STATUS_FAILED = 1;
Charge.STATUS_CANCELED = 2;
Charge.STATUS_COMPLETED = 3;

Charge.CHARGE_SOURCE_PAYPAL = 'paypal';

module.exports = Charge;
