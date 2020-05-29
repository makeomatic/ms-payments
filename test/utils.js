exports.duration = 50 * 30 * 3 * 1000;

exports.simpleDispatcher = function simpleDispatcher(service) {
  return function dispatch(route, params) {
    return service.amqp.publishAndWait(route, params, { timeout: exports.duration * 2 });
  };
};
