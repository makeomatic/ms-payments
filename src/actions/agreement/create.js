const Promise = require('bluebird');
const Errors = require('common-errors');
const paypal = require('paypal-rest-sdk');
const url = require('url');
const key = require('../../redisKey.js');
const billingAgreementCreate = Promise.promisify(paypal.billingAgreement.create, { context: paypal.billingAgreement }); // eslint-disable-line
const find = require('lodash/find');

function agreementCreate(message) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return billingAgreementCreate(message.agreement, _config.paypal)
      .then(newAgreement => {
        const approval = find(newAgreement.links, ['rel', 'approval_url']);
        if (approval === null) {
          throw new Errors.NotSupportedError('Unexpected PayPal response!');
        }

        const token = url.parse(approval.href, true).query.token;
        return {
          token,
          url: approval.href,
          agreement: newAgreement,
        };
      });
  }

  function setToken(response) {
    const planId = response.agreement.plan.id;
    const owner = message.owner;
    const tokenKey = key('subscription-token', response.token);

    return redis
      .pipeline()
      .hmset(tokenKey, { planId, owner })
      .expire(tokenKey, 3600 * 24)
      .exec()
      .return(response);
  }

  /* return back after PayPal fixes it's api
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
  */

  return promise
    .then(sendRequest)
    .then(setToken)
    .catch(err => {
      this.log.error('paypal err: ', err.response && err.response.details || err);
      throw err;
    });
}

module.exports = agreementCreate;
