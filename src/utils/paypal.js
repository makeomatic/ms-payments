const Promise = require('bluebird');
const get = require('lodash/get');
const { HttpStatusError } = require('common-errors');
const { billingAgreement, billingPlan, payment } = require('paypal-rest-sdk');

// helpers
const retryTimeout = parseInt(process.env.PAYPAL_RETRY_TIMEOUT || 6000, 10);
const retryCounter = parseInt(process.env.PAYPAL_RETRY_COUNT || 5, 10);
const retryDelay = parseInt(process.env.PAYPAL_RETRY_DELAY || 250, 10);
const invalidServerResponsePredicate = { httpStatusCode: 200, response: '' };
const promisify = (ops, context) => ops.reduce((acc, op) => {
  const opAsync = Promise.promisify(context[op], { context });

  // init retry op
  acc[op] = function retryPaypalRequest(...args) {
    const tryOp = (counter = 0) => (
      opAsync(...args).catch(invalidServerResponsePredicate, (err) => {
        if (counter > retryCounter) throw err;

        // increment counter
        return Promise.resolve(counter + 1).delay(retryDelay).then(tryOp);
      })
    );

    // ensure that we also have a timeout
    // for now hardcode at 6000
    return tryOp().timeout(retryTimeout);
  };

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
