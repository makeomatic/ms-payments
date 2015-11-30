const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');

function planState(message) {
  const { _config, redis } = this;
  const { id, state } = message;

  const promise = Promise.bind(this);

  function sendRequest() {
    const request = [{
      'op': 'replace',
      'path': '/',
      'value': {
        'state': state,
      },
    }];

    return new Promise((resolve, reject) => {
      paypal.billingPlan.update(id, request, _config.paypal, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(message.state);
        }
      });
    });
  }

  return promise.then(sendRequest);
}

module.exports = planState;
