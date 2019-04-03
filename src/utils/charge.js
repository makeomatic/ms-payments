const { strictEqual } = require('assert');
const uuid = require('uuid/v4');
const moment = require('moment');
const isObject = require('lodash/isObject');
const pick = require('lodash/pick');
const fsort = require('redis-filtered-sort');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertInteger = require('./asserts/integer');
const assertPlainObject = require('./asserts/plain-object');
const { processResult, mapResult } = require('../list-utils');
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

  async markAsComplete(id, sourceId, sourceMetadata, pipeline) {
    assertStringNotEmpty(id, 'charge id is invalid');
    assertStringNotEmpty(sourceId, 'sourceId is invalid');
    assertPlainObject(sourceMetadata, 'sourceMetadata is invalid');

    const chargeUpdateData = {
      sourceId,
      sourceMetadata: JSON.stringify(sourceMetadata),
      status: Charge.STATUS_COMPLETED };

    if (pipeline !== undefined) {
      pipeline.hmset(Charge.dataRedisKey(id), chargeUpdateData);
    } else {
      await this.redis.hmset(Charge.dataRedisKey(id), chargeUpdateData);
    }
  }

  async markAsFailed(id, sourceId, sourceMetadata, failReason) {
    assertStringNotEmpty(id, 'charge id is invalid');
    assertStringNotEmpty(failReason, 'failReason is invalid');
    assertPlainObject(sourceMetadata, 'sourceMetadata is invalid');
    assertStringNotEmpty(failReason, 'failReason is invalid');

    const chargeUpdateData = {
      sourceId,
      failReason,
      sourceMetadata: JSON.stringify(sourceMetadata),
      status: Charge.STATUS_FAILED };

    await this.redis.hmset(Charge.dataRedisKey(id), chargeUpdateData);
  }

  async list(owner, offset, limit, restricted = true) {
    const result = await this.redis
      .fsort(Charge.listRedisKey(owner), Charge.dataRedisKey('*'), 'createAtTimestamp', 'DESC', fsort.filter({}), Date.now(), offset, limit)
      .then(processResult(Charge.dataRedisKey('*').split(':')[0], this.redis))
      .spread(mapResult(offset, limit, false));
    const items = result.items.map(charge => (restricted ? pick(charge, Charge.unrestrictedProps) : charge));

    return Object.assign({ ...result }, { items });
  }

  async get(id, restricted = true) {
    const props = restricted ? Charge.unrestrictedProps : [];

    return this.mapper.get(Charge.dataRedisKey(id), props);
  }
}

Charge.unrestrictedProps = ['id', 'amount', 'description', 'createAt', 'status', 'failReason'/* <-- is it safe? */];
Charge.STATUS_INITIALIZED = 0;
Charge.STATUS_FAILED = 1;
Charge.STATUS_COMPLETED = 2;

module.exports = Charge;
