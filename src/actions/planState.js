const Promise = require('bluebird')
const Errors = require('common-errors')

const paypal = require('paypal-rest-sdk')

const validStates = ["created", "active", "inactive", "deleted"]

function planState(planId, state) {
	if (validStates.indexOf(state) < 0) {
		throw new Errors.ArgumentError(state, new Errors.Error(`State must be one of ${validStates.join(", ")}`))
	}

	const {
		_redis: redis,
		_config: config,
		_ajv: ajv
	} = this

	let promise = Promise.bind(this)

	function sendRequest() {
		const request = {
			"op": "replace",
			"path": "/",
			"value": {
				"state": state
			}
		}

		return Promise.create((resolve, reject) => {
			const { isValid, errors } = _ajv.validate("planUpdate", request)
			if (!isValid) {
				reject(errors)
				return
			}

			paypal.billingPlan.update(planId, request, _config.paypal, (error) => {
				if (error) {
          reject(error)
        } else {
          resolve(state)
        }
			})
		})
	}

	return promise.then(sendRequest)
}

module.exports = planState
