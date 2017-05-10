const Promise = require('bluebird');
const get = require('lodash/get');
const { HttpStatusError } = require('common-errors');
const { billingAgreement, billingPlan } = require('paypal-rest-sdk');

// simple collection of promisified paypal methods

exports.states = {
  active: 'active',
};

exports.is = {
  active: plan => get(plan, 'state', '').toLowerCase() === exports.states.active,
};

exports.agreement = {
  create: Promise.promisify(billingAgreement.create, { context: billingAgreement }),
};

exports.plan = {
  create: Promise.promisify(billingPlan.create, { context: billingPlan }),
  update: Promise.promisify(billingPlan.update, { context: billingPlan }),
};

exports.handleError = (err) => {
  throw new HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
};
