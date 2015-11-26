const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');

/**
 * Create a plan with supplied parameters according to schema
 * @param plan A Plan object to create
 */
function planCreate(plan) {
  const {
    _config
  } = this;

  let promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingPlan.create(plan, _config.paypal, function(error, newPlan) {
        if (error) {
          reject(error)
        } else {
          resolve(newPlan)
        }
      })
    })
  }

  function saveToRedis(plan) {
    // TODO: save to redis something like ID
    return plan
  }

  return promise.then(sendRequest).then(saveToRedis)
}

module.exports = planCreate;
