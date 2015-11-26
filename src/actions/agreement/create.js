const Promise = require('bluebird');
const Errors = require('common-errors');
const ld = require('lodash');
const paypal = require('paypal-rest-sdk');
const url = require('url');

function agreementCreate(agreement) {
  const {
    _config,
    } = this;

  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.create(agreement, _config.paypal, (error, newAgreement) => {
        if (error) {
          reject(error);
        } else {
          const approval = ld.findWhere(newAgreement.links, {rel: 'approval_url'});
          if (approval === null) {
            reject(new Errors.NotSupportedError('Unexpected PayPal response!'));
          } else {
            const token = url.parse(approval.href, true).query.token;
            resolve({token, url: approval.href, agreement: newAgreement});
          }
        }
      });
    });
  }

  return promise.then(sendRequest);
}

module.exports = agreementCreate;
