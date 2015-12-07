const Promise = require('bluebird');
const Errors = require('common-errors');
const ld = require('lodash');
const paypal = require('paypal-rest-sdk');
const url = require('url');
const key = require('../../redisKey.js');

function agreementCreate(message) {
  const { _config, redis, amqp } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.create(message.agreement, _config.paypal, (error, newAgreement) => {
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

  function saveToRedis(response) {
    const agreementKey = key('agreements-data', response.agreement.id);
    const pipeline = redis.pipeline;

    pipeline.hsetnx(agreementKey, 'agreement', JSON.stringify(response.agreement));
    pipeline.hsetnx(agreementKey, 'state', response.agreement.state);
    pipeline.hsetnx(agreementKey, 'name', response.agreement.name);
    pipeline.hsetnx(agreementKey, 'token', response.agreement.token);
    pipeline.hsetnx(agreementKey, 'plan', response.agreement.plan.id);
    pipeline.hsetnx(agreementKey, 'owner', message.owner);

    pipeline.sadd('agreements-index', response.agreement.id);

    return pipeline.exec().then(() => {
      return response;
    });
  }

  function updateMetadata(response) {
    const updateRequest = {
      'username': message.owner,
      'audience': _config.billing.audience,
      '$set': {
        'agreement': response.agreement.id,
      },
    };

    return amqp
      .publishAndWait(_config.users.prefix + '.' + _config.users.postfix.updateMetadata, updateRequest, {timeout: 5000})
      .then(() => {
        return response;
      });
  }

  return promise.then(sendRequest).then(saveToRedis).then(updateMetadata);
}

module.exports = agreementCreate;
