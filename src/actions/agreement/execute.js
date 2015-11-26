const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');

function agreementExecute(token) {
	const {
		_config
	} = this;

	let promise = Promise.bind(this);

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

module.exports = agreementExecute;
