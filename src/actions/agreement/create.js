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
    const agreementKey = key('agreements-data', response.agreement.id);
    const pipeline = redis.pipeline();

    pipeline.hsetnx(agreementKey, 'agreement', JSON.stringify(response.agreement));
    pipeline.hsetnx(agreementKey, 'state', response.agreement.state);
    pipeline.hsetnx(agreementKey, 'name', response.agreement.name);
    pipeline.hsetnx(agreementKey, 'token', response.agreement.token);
    pipeline.hsetnx(agreementKey, 'plan', response.agreement.plan.id);
    pipeline.hsetnx(agreementKey, 'owner', message.owner);

    pipeline.sadd('agreements-index', response.agreement.id);

    return pipeline.exec().return(response.agreement);
  }

  function fetchPlan(agreement) {
    return getPlan(agreement.plan.id).then((plan) => {
      return { agreement, plan };
    });
  }

  function updateMetadata(data) {
    const { plan, agreement } = data;

    const subscription = ld.findWhere(plan.subscriptions, { name: 'free' });
    const nextCycle = moment().add(1, 'month').format();

    const updateRequest = {
      'username': message.owner,
      'audience': _config.billing.audience,
      '$set': {
        'agreement': agreement.id,
        plan: plan.id,
        models: subscription.models,
        model_price: subscription.price,
        next_cycle: nextCycle,
      },
    };

    return amqp
      .publishAndWait(_config.users.prefix + '.' + _config.users.postfix.updateMetadata, updateRequest, {timeout: 5000})
      .return(agreement);
  }

  return promise.then(sendRequest).then(saveToRedis).then(fetchPlan).then(updateMetadata);
}

module.exports = agreementCreate;
