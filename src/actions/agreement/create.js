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
          return reject(error);
        }

        const approval = ld.findWhere(newAgreement.links, { rel: 'approval_url' });
        if (approval === null) {
          return reject(new Errors.NotSupportedError('Unexpected PayPal response!'));
        }

        const token = url.parse(approval.href, true).query.token;
        resolve({ token, url: approval.href, agreement: newAgreement });
      });
    });
  }

  function saveToRedis(response) {
    const agreement = response.agreement;
    const agreementKey = key('agreements-data', agreement.id);
    const pipeline = redis.pipeline();

    const data = {
      agreement,
      state: agreement.state,
      name: agreement.name,
      token: agreement.token,
      plan: agreement.plan.id,
      owner: message.owner,
    };

    pipeline.hmset(agreementKey, ld.mapValues(data, JSON.stringify, JSON));
    pipeline.sadd('agreements-index', agreement.id);

    return pipeline.exec().return(response);
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = agreementCreate;
