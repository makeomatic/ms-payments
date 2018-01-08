const Promise = require('bluebird');
const { deserialize, calcSlot } = require('./utils/redis.js');

function processResult(dataIndex, redis) {
  return (ids) => {
    const length = +ids.pop();
    if (length === 0 || ids.length === 0) {
      return [
        [],
        [],
        length,
      ];
    }

    const pipeline = redis.pipeline();
    ids.forEach((planId) => {
      pipeline.hgetall(`${dataIndex}:${planId}`);
    });

    return Promise.join(
      ids,
      pipeline.exec(),
      length
    );
  };
}

function mapResult(offset, limit) {
  return (ids, props, length) => {
    const items = ids.map((_, idx) => deserialize(props[idx][1]));

    return {
      items,
      cursor: offset + limit,
      page: Math.floor(offset / limit) + 1,
      pages: Math.ceil(length / limit),
    };
  };
}

function passThrough(input) {
  return input;
}

function hmget(fields, func = passThrough, ctx, defaults) {
  return function transformer(data) {
    return fields.reduce((acc, field, idx) => {
      const datum = data[idx] || defaults;
      acc[field] = func.call(ctx || this, datum);
      return acc;
    }, {});
  };
}

function transform(keys, prefixLength) {
  return keys.map(key => key.slice(prefixLength));
}

function cleanupCache(_index) {
  const { redis, config } = this;
  const { keyPrefix } = config.redis.options;
  const keyPrefixLength = keyPrefix.length;
  const index = `${keyPrefix}${_index}`;
  const cacheKeys = [];
  const slot = calcSlot(index);
  // this has possibility of throwing, but not likely to since previous operations
  // would've been rejected already, in a promise this will result in a rejection
  const nodeKeys = redis.slots[slot];
  const masters = redis.connectionPool.nodes.master;
  const masterNode = nodeKeys.reduce((node, key) => node || masters[key], null);

  function scan(node, cursor = '0') {
    return node
      .scan(cursor, 'MATCH', `${index}:*`, 'COUNT', 50)
      .then((response) => {
        const [next, keys] = response;

        if (keys.length > 0) {
          cacheKeys.push(...transform(keys, keyPrefixLength));
        }

        if (next === '0') {
          if (cacheKeys.length === 0) {
            return Promise.resolve(0);
          }

          return redis.del(cacheKeys);
        }

        return scan(node, next);
      });
  }

  return scan(masterNode);
}

exports.cleanupCache = cleanupCache;
exports.processResult = processResult;
exports.mapResult = mapResult;
exports.hmget = hmget;
