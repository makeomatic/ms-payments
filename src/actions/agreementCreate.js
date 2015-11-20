const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

function agreementCreate(agreement) {
	const {
		_redis: redis,
		_config: config
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		return Promise.create((resolve, reject) => {
			paypal.billingAgreement.create(agreement, _config.paypal, (error, newAgreement) => {
				if (error) {
					reject(error)
				} else {
					resolve(newAgreement)
				}
			})
		})
	}

	return promise.then(sendRequest)
}

module.exports = agreementCreate
