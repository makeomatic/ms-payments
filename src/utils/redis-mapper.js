const zipObject = require('lodash/zipObject');
const isNull = require('lodash/isNull');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertArray = require('./asserts/array');

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
}

module.exports = RedisMapper;
