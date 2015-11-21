const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

/**
 * Retrieve list of available Plans
 * @param {query} https://developer.paypal.com/docs/rest/api/payments.billing-plans/#list
 * @return {plans} Array of plans
 */
function planList(query) {
	const {
		_config
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		return new Promise((resolve, reject) => {
			paypal.billingPlan.list(query, _config.paypal, (error, list) => {
				if (error) {
					reject(error)
				} else {
					resolve(list)
				}
			})
		})
	}

	return promise.then(sendRequest)
}

module.exports = planList
