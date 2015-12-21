const Promise = require('bluebird');
const ld = require('lodash');

function processResult(dataIndex, redis) {
  return (ids) => {
    const length = +ids.pop();
    if (length === 0 || ids.length === 0) {
      return [
        ids || [],
        [],
        length,
      ];
    }

    const pipeline = redis.pipeline();
    ids.forEach(planId => {
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
    const items = ids.map(function remapData(_, idx) {
      return ld.reduce(props[idx][1], function reduce(result, val, key) {
        if (val !== '') {
          result[key] = JSON.parse(val);
        }

        return result;
      }, {});
    });

    return {
      items,
      cursor: offset + limit,
      page: Math.floor(offset / limit + 1),
      pages: Math.ceil(length / limit),
    };
  };
}

function passThrough(input) {
  return input;
}

function hmget(fields, func = passThrough, ctx) {
  return function transformer(data) {
    return fields.reduce(function transform(acc, field, idx) {
      acc[field] = func.call(ctx || this, data[idx]);
      return acc;
    }, {});
  };
}

exports.processResult = processResult;
exports.mapResult = mapResult;
exports.hmget = hmget;
