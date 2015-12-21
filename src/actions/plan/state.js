const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');

function planState(message) {
  const { _config, redis } = this;
  const { id, state } = message;

  const promise = Promise.bind(this);

  function sendRequest() {
    const request = [{
      'op': 'replace',
      'path': '/',
      'value': { state },
    }];

    return new Promise((resolve, reject) => {
      paypal.billingPlan.update(id, request, _config.paypal, (error) => {
        if (error) {
          return reject(error);
        }

        return resolve(message.state);
      });
    });
  }

  function updateRedis() {
    const agreementKey = key('plans-data', id);
    return redis.hset(agreementKey, 'state', JSON.stringify(state));
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planState;
