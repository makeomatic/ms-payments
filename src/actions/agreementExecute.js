const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

function agreementExecute(token) {
	const {
		_redis: redis,
		_config: config
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		return new Promise((resolve, reject) => {
			paypal.billingAgreement.execute(token, {}, _config.paypal, (error, executedInfo) => {
				if (error) {
					reject(error)
				} else {
					resolve(executedInfo)
				}
			})
		})
	}

	return promise.then(sendRequest)
}

module.exports = agreementExecute
