const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

function planUpdate(message) {
	const {
		_config
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		return new Promise((resolve, reject) => {
			paypal.billingPlan.update(message.id, message.query, _config.paypal, (error) => {
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
