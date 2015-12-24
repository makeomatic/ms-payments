const Promise = require('bluebird');
const Errors = require('common-errors');
const ld = require('lodash');
const paypal = require('paypal-rest-sdk');
const url = require('url');
const key = require('../../redisKey.js');
const getPlan = require('../plan/get');
const moment = require('moment');

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

  function fetchPlan(agreement) {
    return getPlan.call(this, agreement.plan.id).then((plan) => {
      return { agreement, plan };
    });
  }

  function updateMetadata(data) {
    const { plan, agreement } = data;

    const subscription = ld.findWhere(plan.subscriptions, { name: 'free' });
    const nextCycle = moment().add(1, 'month').format();

    const updateRequest = {
      'username': message.owner,
      'audience': _config.users.audience,
      '$set': {
        nextCycle,
        agreement: agreement.id,
        plan: plan.id,
        models: subscription.models,
        modelPrice: subscription.price,
      },
    };

    return amqp
      .publishAndWait(_config.users.prefix + '.' + _config.users.postfix.updateMetadata, updateRequest, { timeout: 5000 })
      .return(agreement);
  }

  return promise.then(sendRequest).then(saveToRedis).then(fetchPlan).then(updateMetadata);
}

module.exports = agreementCreate;
