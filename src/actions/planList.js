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
		_redis: redis,
		_config: config,
		_ajv: ajv
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		return Promise.create((resolve, reject) => {
			const { isValid, errors } = _ajv.validate("planGet", query)
			if (!isValid) {
				reject(errors)
				return
			}

			paypal.billingPlan.get(query, _config.paypal, (error, list) => {
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
