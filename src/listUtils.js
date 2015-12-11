const Promise = require('bluebird');

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
      return props[idx][1];
    });

    return {
      items,
      cursor: offset + limit,
      page: Math.floor(offset / limit + 1),
      pages: Math.ceil(length / limit),
    };
  };
}

exports.processResult = processResult;
exports.mapResult = mapResult;
