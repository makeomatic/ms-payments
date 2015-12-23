const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');

function planState(message) {
  const { _config, redis } = this;
  const { id, state } = message;

  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement[message.state].call(paypal.billingAgreement, id, state, _config.paypal, (error) => {
        if (error) {
          return reject(error);
        }

        resolve(state);
      });
    });
  }

  function updateRedis() {
    const agreementKey = key('agreements-data', id);
    const pipeline = redis.pipeline();

    pipeline.hset(agreementKey, 'state', state);

    return pipeline.exec().then(() => {
      return state;
    });
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planState;
