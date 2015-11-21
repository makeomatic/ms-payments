const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

function planUpdate(planId, query) {
	const {
		_redis: redis,
		_config: config,
		_ajv: ajv
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		return new Promise((resolve, reject) => {
			const { isValid, errors } = _ajv.validate("planUpdate", query)
			if (!isValid) {
				reject(errors)
				return
			}

			paypal.billingPlan.update(planId, query, _config.paypal, (error) => {
				if (error) {
					reject(error)
				} else {
					resolve(true)
				}
			})
		})
	}

	return promise.then(sendRequest)
}

module.exports = planUpdate
