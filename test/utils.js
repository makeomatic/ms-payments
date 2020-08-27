const Promise = require('bluebird');

exports.duration = 50 * 30 * 3 * 1000;

exports.simpleDispatcher = function simpleDispatcher(service) {
  return function dispatch(route, params) {
    return service.amqp.publishAndWait(route, params, { timeout: exports.duration * 2 });
  };
};

exports.clearRedis = function clearRedis(redis) {
  if (redis.nodes) {
    const nodes = redis.nodes('master');

    return Promise
      .map(nodes, (node) => node.flushdb())
      .reflect();
  }

  return redis.flushdb();
};
