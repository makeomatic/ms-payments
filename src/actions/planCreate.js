const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

/**
 * Create a plan with supplied parameters according to schema
 * @param {Object} Plan object
 */
function planCreate(newPlan) {
  const {
    _redis: redis,
    _config
  } = this

  let promise = Promise.bind(this)

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingPlan.create(newPlan, _config.paypal, function(error, plan) {
        if (error) {
          reject(error)
        } else {
          resolve(plan)
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

module.exports = planCreate
