const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const ld = require('lodash');
const getPlan = require('../plan/get');
const moment = require('moment');
const billingAgreement = Promise.promisifyAll(paypal.billingAgreement, { context: paypal.billingAgreement });

function agreementExecute(message) {
  const { _config, redis, amqp } = this;
  const promise = Promise.bind(this);
  const { token, owner } = message;

  function sendRequest() {
    return billingAgreement.executeAsync(token, {}, _config.paypal).get('id');
  }

  function fetchUpdatedAgreement(id) {
    return billingAgreement.getAsync(id, _config.paypal);
  }

  function fetchPlan(agreement) {
    return redis.get(token).then((planId) => { return { planId, agreement }; });
  }

  function fetchSubscription(data) {
    const { planId, agreement } = data;
    const subscriptionName = agreement.plan.payment_definitions[0].name;

    return getPlan.call(this, planId).then((plan) => {
      .then(plan => {
      const subscription = ld.findWhere(plan.subs, { name: subscriptionName });
      return { agreement, subscription, planId };
    });
  }

  function updateMetadata(data) {
    const { subscription, agreement, planId } = data;

    const period = subscription.definition.frequency;
    const nextCycle = moment().add(1, period.toLowerCase()).format();

    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

    const updateRequest = {
      'username': owner,
      'audience': _config.users.audience,
      '$set': {
        nextCycle,
        agreement: agreement.id,
        plan: planId,
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
      token,
      plan: agreement.plan.id,
      owner,
    };

    pipeline.hmset(agreementKey, ld.mapValues(data, JSON.stringify, JSON));
    pipeline.sadd('agreements-index', agreement.id);

    return pipeline.exec().return(agreement);
  }

  return promise
    .then(sendRequest)
    .then(fetchUpdatedAgreement)
    .then(fetchPlan)
    .then(fetchSubscription)
    .then(updateMetadata)
    .then(updateRedis);
}

module.exports = agreementExecute;
