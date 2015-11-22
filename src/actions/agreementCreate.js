const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')
const url = require('url')

function agreementCreate(agreement) {
	const {
		_config
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		return new Promise((resolve, reject) => {
			paypal.billingAgreement.create(agreement, _config.paypal, (error, newAgreement) => {
				if (error) {
					reject(error)
				} else {
					for (link of newAgreement.links) {
						if (link.rel == "approval_url") {
							const token = url.parse(link.href, true).query.token
							const approval_url = link.href

							resolve({ token: token, url: approval_url })
						}
					}
				}
			})
		})
	}

	return promise.then(sendRequest)
}

module.exports = agreementCreate
