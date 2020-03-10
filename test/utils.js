exports.simpleDispatcher = function simpleDispatcher(service) {
  return function dispatch(route, params) {
    return service.amqp.publishAndWait(route, params, { timeout: 60000 });
  };
};
