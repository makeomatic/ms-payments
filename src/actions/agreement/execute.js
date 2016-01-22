const Errors = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const getPlan = require('../plan/get');
const moment = require('moment');
const billingAgreement = Promise.promisifyAll(paypal.billingAgreement, { context: paypal.billingAgreement }); // eslint-disable-line
const find = require('lodash/find');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);

const setState = require('./state');
const { parseAgreement, saveCommon } = require('../../utils/transactions');

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
      const subscription = find(plan.subs, ['name', subscriptionName]);
      return { agreement, subscription, planId, owner };
    });
  }

  function getCurrentAgreement(data) {
    const path = _config.users.prefix + '.' + _config.users.postfix.getMetadata;
    const audience = _config.users.audience;
    const getRequest = {
      username: data.owner,
      audience,
    };

    return amqp.publishAndWait(path, getRequest, { timeout: 5000 })
      .get(audience)
      .get('agreement')
      .then((agreement) => {
        return { data, oldAgreement: agreement };
      });
  }

  function checkAndDeleteAgreement(data) {
    if (data.data.agreement.id !== data.oldAgreement && data.oldAgreement !== 'free') {
      // remove old agreement if setting new one
      return setState.call(this, { owner: data.data.owner, status: 'cancel' }).return(data.data);
    }
    return data.data;
  }

  function updateMetadata(data) {
    const { subscription, agreement, planId, owner } = data;

    const period = subscription.definition.frequency.toLowerCase();
    const nextCycle = moment().add(1, period);

    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

    const updateRequest = {
      username: owner,
      audience: _config.users.audience,
      metadata: {
        $set: {
          nextCycle: nextCycle.valueOf(),
          agreement: agreement.id,
          plan: planId,
          modelPrice: subscription.price,
          subscriptionPrice: agreement.plan.payment_definitions[0].amount.value,
          subscriptionInterval: agreement.plan.payment_definitions[0].frequency.toLowerCase(),
        },
        $incr: {
          models: subscription.models,
        },
      },
    };

    return amqp
      .publishAndWait(path, updateRequest, { timeout: 5000 })
      .return({ agreement, owner, planId });
  }

  function updateRedis({ agreement, owner, planId }) {
    const agreementKey = key('agreements-data', agreement.id);
    const pipeline = redis.pipeline();

    const data = {
      agreement,
      state: agreement.state,
      token,
      plan: planId,
      owner,
    };

    pipeline.hmset(agreementKey, mapValues(data, JSONStringify));
    pipeline.sadd('agreements-index', agreement.id);

    return pipeline.exec().return({ agreement, owner });
  }

  function updateCommon({ agreement, owner }) {
    return Promise.bind(this, parseAgreement(agreement, owner)).then(saveCommon).return(agreement);
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
    .then(getCurrentAgreement)
    .then(checkAndDeleteAgreement)
    .then(updateMetadata)
    .then(updateRedis)
    .then(updateCommon)
    .tap(cleanup);
}

module.exports = agreementExecute;
