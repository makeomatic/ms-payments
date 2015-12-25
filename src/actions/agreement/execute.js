const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const ld = require('lodash');
const getPlan = require('../plan/get');
const moment = require('moment');

function agreementExecute(token) {
  const { _config, redis, amqp } = this;
  const promise = Promise.bind(this);

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
      console.log(plan);
      console.log(agreement.plan);
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
      'username': agreement.owner,
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

    const data = ld.mapValues({
      agreement,
      state: agreement.state,
      name: agreement.name,
    }, JSON.stringify, JSON);

    return redis.hmset(agreementKey, data).return(agreement);
  }

  return promise.then(sendRequest).then(fetchUpdatedAgreement).then(fetchSubscription).then(updateMetadata).then(updateRedis);
}

module.exports = agreementExecute;
