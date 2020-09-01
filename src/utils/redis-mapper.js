const zipObject = require('lodash/zipObject');
const isNull = require('lodash/isNull');

const assertArray = require('./asserts/array');
const assertPlainObject = require('./asserts/plain-object');
const assertStringNotEmpty = require('./asserts/string-not-empty');

class RedisMapper {
  constructor(redis) {
    this.redis = redis;
  }

  async get(key, fields = []) {
    assertStringNotEmpty(key, 'key is invalid');
    assertArray(fields, 'fields is invalid');

    if (fields.length === 0) {
      const data = await this.redis.hgetall(key);

      return Object.keys(data).length !== 0 ? data : null;
    }

    const data = await this.redis.hmget(key, fields);

    return data.every(isNull) ? null : zipObject(fields, data);
  }

  addToCollection(collectionKey, dataKeyPrefix, id, data) {
    assertStringNotEmpty(collectionKey, 'collectionKey is invalid');
    assertStringNotEmpty(dataKeyPrefix, 'dataKeyPrefix is invalid');
    assertStringNotEmpty(id, 'id is invalid');
    assertPlainObject(data, 'data is invalid');

    const pipeline = this.redis.pipeline();

    pipeline.zadd(collectionKey, Date.now(), id);
    pipeline.hmset([dataKeyPrefix, id].join(':'), data);

    return pipeline.exec();
  }

  deleteFromCollection(collectionKey, dataKeyPrefix, id) {
    assertStringNotEmpty(collectionKey, 'collectionKey is invalid');
    assertStringNotEmpty(dataKeyPrefix, 'dataKeyPrefix is invalid');
    assertStringNotEmpty(id, 'id is invalid');

    const pipeline = this.redis.pipeline();

    pipeline.zrem(collectionKey, id);
    pipeline.del([dataKeyPrefix, id].join(':'));

    return pipeline.exec();
  }

  async fetchCollection(collectionKey, dataKeyPrefix) {
    assertStringNotEmpty(collectionKey, 'collectionKey is invalid');

    const ids = await this.redis.zrange(collectionKey, 0, -1);
    const dataKeys = ids.map((id) => [dataKeyPrefix, id].join(':'));
    const pipeline = this.redis.pipeline();

    for (const dataKey of dataKeys) {
      pipeline.hgetall(dataKey);
    }

    return pipeline
      .exec()
      // @TODO handle errors
      .map((data) => data[1]);
  }
}

module.exports = RedisMapper;
