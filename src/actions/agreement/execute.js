const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const ld = require('lodash');
const getPlan = require('../plan/get');
const moment = require('moment');

function agreementExecute(message) {
  const { _config, redis, amqp } = this;
  const promise = Promise.bind(this);
  const { token, owner } = message;

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.execute(token, {}, _config.paypal, (error, info) => {
        if (error) {
          return reject(error);
        }

        resolve(info.id);
      });
    });
  }

  function fetchUpdatedAgreement(id) {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.get(id, _config.paypal, (error, agreement) => {
        if (error) {
          return reject(error);
        }

        resolve(agreement);
      });
    });
  }

  function fetchSubscription(agreement) {
    const subscriptionName = agreement.plan.payment_definitions[0].name;

    return getPlan.call(this, agreement.plan.id).then((plan) => {
      const subscription = ld.findWhere(plan.subs, { name: subscriptionName });
      return { agreement, subscription };
    });
  }

  function updateMetadata(data) {
    const { subscription, agreement } = data;

    const period = subscription.definition.frequency;
    const nextCycle = moment().add(1, period).format();

    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

    const updateRequest = {
      'username': owner,
      'audience': _config.users.audience,
      '$set': {
        nextCycle,
        agreement: agreement.id,
        plan: agreement.plan.id,
        models: subscription.models,
        modelPrice: subscription.price,
      },
    };

    return amqp.publishAndWait(path, updateRequest, { timeout: 5000 }).return(agreement);
  }

  function updateRedis(agreement) {
    const agreementKey = key('agreements-data', agreement.id);
    const pipeline = redis.pipeline();

    const data = {
      agreement,
      state: agreement.state,
      name: agreement.name,
      token: token,
      plan: agreement.plan.id,
      owner: owner,
    };

    pipeline.hmset(agreementKey, ld.mapValues(data, JSON.stringify, JSON));
    pipeline.sadd('agreements-index', agreement.id);

    return pipeline.exec().return(agreement);
  }

  return promise.then(sendRequest).then(fetchUpdatedAgreement).then(fetchSubscription).then(updateMetadata).then(updateRedis);
}

module.exports = agreementExecute;
