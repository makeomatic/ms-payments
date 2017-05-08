const Promise = require('bluebird');
const assert = require('assert');

exports.duration = 20 * 1000;

exports.debug = function debug(result) {
  if (result.isRejected()) {
    const err = result.reason();
    console.log(require('util').inspect(err, {depth: 5}) + '\n'); // eslint-disable-line
    console.log(err && err.stack || err); // eslint-disable-line
    console.log(err && err.response || ''); // eslint-disable-line
  }
};

exports.simpleDispatcher = function simpleDispatcher(service) {
  return function dispatch(route, params) {
    return service.amqp.publishAndWait(route, params, { timeout: 60000 });
  };
};

exports.inspectPromise = function inspectPromise(mustBeFulfilled = true) {
  return function inspection(promise) {
    const isFulfilled = promise.isFulfilled();
    const isRejected = promise.isRejected();

    try {
      assert.equal(isFulfilled, mustBeFulfilled);
    } catch (e) {
      if (isFulfilled) {
        return Promise.reject(new Error(JSON.stringify(promise.value())));
      }

      throw promise.reason();
    }

    assert.equal(isRejected, !mustBeFulfilled);
    return mustBeFulfilled ? promise.value() : promise.reason();
  };
};
