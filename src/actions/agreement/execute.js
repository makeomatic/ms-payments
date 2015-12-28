const Errors = require('common-errors');
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
  const { token } = message;
  const tokenKey = key('subscription-token', token);

  function sendRequest() {
    return billingAgreement.executeAsync(token, {}, _config.paypal).get('id');
  }

  function fetchUpdatedAgreement(id) {
    return billingAgreement.getAsync(id, _config.paypal);
  }

  function fetchPlan(agreement) {
    return redis.hgetall(tokenKey)
      .then(data => ({ ...data, agreement }));
  }

  function fetchSubscription(data) {
    const { planId, agreement, owner } = data;
    const subscriptionName = agreement.plan.payment_definitions[0].frequency.toLowerCase();

    return getPlan.call(this, planId).then((plan) => {
      const subscription = ld.findWhere(plan.subs, { name: subscriptionName });
      return { agreement, subscription, planId, owner };
    });
  }

  function updateMetadata(data) {
    const { subscription, agreement, planId, owner } = data;

    const period = subscription.definition.frequency.toLowerCase();
    const nextCycle = moment().add(1, period).format();

    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

    const updateRequest = {
      username: owner,
      audience: _config.users.audience,
      metadata: {
        $set: {
          nextCycle,
          agreement: agreement.id,
          plan: planId,
          modelPrice: subscription.price,
        },
        $incr: {
          models: subscription.models,
        },
      },
    };

    return amqp.publishAndWait(path, updateRequest, { timeout: 5000 }).return({ agreement, owner });
  }

  function updateRedis({ agreement, owner }) {
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

  function verifyToken() {
    return redis
      .exists(tokenKey)
      .then(response => {
        if (!response) {
          throw new Errors.HttpStatusError(404, `subscription token ${token} was not found`);
        }
      });
  }

  // that way we cant use the token again
  function cleanup() {
    return redis.del(tokenKey);
  }

  return promise
    .then(verifyToken)
    .then(sendRequest)
    .then(fetchUpdatedAgreement)
    .then(fetchPlan)
    .then(fetchSubscription)
    .then(updateMetadata)
    .then(updateRedis)
    .tap(cleanup);
}

module.exports = agreementExecute;
