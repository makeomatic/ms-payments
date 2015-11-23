const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

function planState(message) {
	const {
		//_redis: redis,
		_config
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		const request = [{
			"op": "replace",
			"path": "/",
			"value": {
				"state": message.state
			}
		}]

		return new Promise((resolve, reject) => {
			paypal.billingPlan.update(message.id, request, _config.paypal, (error) => {
				if (error) {
          reject(error)
        } else {
          resolve(message.state)
        }
			})
		})
	}

	return promise.then(sendRequest)
}

module.exports = planState
