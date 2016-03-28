const Promise = require('bluebird');
const Errors = require('common-errors');
const paypal = require('paypal-rest-sdk');
const moment = require('moment');
const url = require('url');
const key = require('../../redisKey.js');
const billingAgreementCreate = Promise.promisify(paypal.billingAgreement.create, { context: paypal.billingAgreement }); // eslint-disable-line
const find = require('lodash/find');
const debug = require('debug')('nightmare:paypal-plan');
const { PAYPAL_DATE_FORMAT, PLANS_DATA } = require('../../constants.js');
const { deserialize } = require('../../utils/redis.js');

function agreementCreate(message) {
  const { _config, redis } = this;
  const planId = message.agreement.plan.id;

  function fetchPlan() {
    return redis
      .hgetallBuffer(key(PLANS_DATA, planId))
      .then(data => {
        if (!data) {
          throw new Errors.HttpStatusError(404, `plan ${planId} not found`);
        }

        return deserialize(data);
      })
      .tap(data => {
        if (data.state.toLowerCase() !== 'active') {
          throw new Errors.HttpStatusError(412, `plan ${planId} is inactive`);
        }
      });
  }

  function sendRequest(plan) {
    const planData = {
      ...message.agreement,
      start_date: moment().add(1, plan.subs[0].name).format(PAYPAL_DATE_FORMAT),
      override_merchant_preferences: {
        setup_fee: plan.subs[0].definition.amount,
      },
    };

    debug('init plan %j', planData);

    return billingAgreementCreate(planData, _config.paypal)
      .catch(err => {
        throw new Errors.HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
      })
      .then(newAgreement => {
        const approval = find(newAgreement.links, { rel: 'approval_url' });
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
    const owner = message.owner;
    const tokenKey = key('subscription-token', response.token);

    return redis
      .pipeline()
      .hmset(tokenKey, { planId, owner })
      .expire(tokenKey, 3600 * 24)
      .exec()
      .return(response);
  }

  return Promise
    .bind(this)
    .then(fetchPlan)
    .then(sendRequest)
    .then(setToken);
}

module.exports = agreementCreate;
