const Errors = require('common-errors');
const Promise = require('bluebird');
const moment = require('moment');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const getPlan = require('../plan/get');
const billingAgreement = Promise.promisifyAll(paypal.billingAgreement, { context: paypal.billingAgreement }); // eslint-disable-line
const find = require('lodash/find');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);

const pullTransactionsData = require('../transaction/sync.js');
const setState = require('./state');
const { AGREEMENT_INDEX, AGREEMENT_DATA } = require('../../constants.js');

function agreementExecute(message) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = _config;
  const { token } = message;
  const tokenKey = key('subscription-token', token);

  function sendRequest() {
    return billingAgreement.executeAsync(token, {}, _config.paypal)
      .catch(err => {
        throw new Errors.HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
      })
      .get('id');
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
      const subscription = find(plan.subs, { name: subscriptionName });
      return { agreement, subscription, planId, owner };
    });
  }

  function getCurrentAgreement(data) {
    const path = `${prefix}.${postfix.getMetadata}`;
    const getRequest = {
      username: data.owner,
      audience,
    };

    return amqp
      .publishAndWait(path, getRequest, { timeout: 5000 })
      .get(audience)
      .get('agreement')
      .then(agreement => ({
        data,
        oldAgreement: agreement,
      }));
  }

  function syncTransactions({ agreement, owner }) {
    return pullTransactionsData
      .call(this, {
        id: agreement.id,
        owner,
        start: moment().subtract(1, 'day').format('YYYY-MM-DD'),
        end: moment().add(1, 'day'.format('YYYY-MM-DD')),
      })
      .return(agreement);
  }

  function checkAndDeleteAgreement({ data, oldAgreement }) {
    if (data.agreement.id !== oldAgreement && oldAgreement !== 'free') {
      // remove old agreement if setting new one
      return setState
        .call(this, {
          owner: data.owner,
          state: 'cancel',
        })
        .catch({ statusCode: 400 }, err => {
          this.log.warn('oldAgreement was already cancelled', err);
        })
        .return(data);
    }

    return data;
  }

  function updateMetadata(data) {
    const { subscription, agreement, planId, owner } = data;
    const path = `${prefix}.${postfix.updateMetadata}`;

    const updateRequest = {
      username: owner,
      audience,
      metadata: {
        $set: {
          nextCycle: moment(agreement.start_date).valueOf(),
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
    const agreementKey = key(AGREEMENT_DATA, agreement.id);
    const pipeline = redis.pipeline();

    const data = {
      agreement,
      state: agreement.state,
      token,
      plan: planId,
      owner,
    };

    pipeline.hmset(agreementKey, mapValues(data, JSONStringify));
    pipeline.sadd(AGREEMENT_INDEX, agreement.id);

    return pipeline.exec().return({ agreement, owner });
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

  return Promise
    .bind(this)
    .then(verifyToken)
    .then(sendRequest)
    .then(fetchUpdatedAgreement)
    .then(fetchPlan)
    .then(fetchSubscription)
    .then(getCurrentAgreement)
    .then(checkAndDeleteAgreement)
    .then(updateMetadata)
    .then(updateRedis)
    .tap(cleanup)
    .then(syncTransactions);
}

module.exports = agreementExecute;
