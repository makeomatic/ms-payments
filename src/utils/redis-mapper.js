const zipObject = require('lodash/zipObject');

const assertStringNotEmpty = require('./asserts/string-not-empty');
const assertArray = require('./asserts/array');

class RedisMapper {
  constructor(redis) {
    this.redis = redis;
  }

  async get(key, props = []) {
    assertStringNotEmpty(key, 'key is invalid');
    assertArray(props, 'props is invalid');

    if (props.length === 0) {
      const data = await this.redis.hgetall(key);

      return Object.keys(data).length !== 0 ? data : null;
    }

    const data = await this.redis.hmget(key, props);

    return zipObject(props, data);
  }
}

module.exports = RedisMapper;
