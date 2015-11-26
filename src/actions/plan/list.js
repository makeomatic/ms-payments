const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');

/**
 * Retrieve list of available Plans
 * @param message https://developer.paypal.com/docs/rest/api/payments.billing-plans/#list
 * @return plans Array of plans
 */
function planList(message) {
  const {
    _config,
    } = this;

  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingPlan.list(message.query, _config.paypal, (error, list) => {
        if (error) {
          reject(error);
        } else {
          resolve(list);
        }
      });
    });
  }

  return promise.then(sendRequest);
}

module.exports = planList;
