const Promise = require('bluebird');
const { HttpStatusError } = require('common-errors');
const { billingAgreement } = require('paypal-rest-sdk');

// simple collection of promisified paypal methods

exports.billing = {
  create: Promise.promisify(billingAgreement.create, { context: billingAgreement }),
};

exports.handleError = (err) => {
  throw new HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
};
