const Promise = require('bluebird');
const get = require('lodash/get');
const { HttpStatusError } = require('common-errors');
const { billingAgreement, billingPlan, payment } = require('paypal-rest-sdk');

// helpers
const promisify = (ops, context) => ops.reduce((acc, op) => {
  acc[op] = Promise.promisify(billingAgreement[op], { context });
  return acc;
}, {});

// simple collection of promisified paypal methods

exports.states = {
  active: 'active',
};

exports.is = {
  active: plan => get(plan, 'state', '').toLowerCase() === exports.states.active,
};

exports.agreement = promisify([
  'create',
  'execute',
  'get',
  'suspend',
  'reactivate',
  'cancel',
  'searchTransactions',
], billingAgreement);

exports.plan = promisify([
  'create',
  'update',
], billingPlan);

exports.payment = promisify([
  'create',
  'execute',
  'list',
], payment);

exports.handleError = (err) => {
  throw new HttpStatusError(err.httpStatusCode, get(err, 'response.message', err.message), get(err, 'response.name', err.name));
};

exports.blacklistedProps = ['id', 'state', 'hidden', 'create_time', 'update_time', 'links', 'httpStatusCode'];
