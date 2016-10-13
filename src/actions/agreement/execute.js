const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const moment = require('moment');
const paypal = require('paypal-rest-sdk');
const find = require('lodash/find');

// helpers
const key = require('../../redisKey');
const { AGREEMENT_INDEX, AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants.js');
const { serialize } = require('../../utils/redis.js');

// internal actions
const pullTransactionsData = require('../transaction/sync.js');
const setState = require('./state');
const getPlan = require('../plan/get');

// eslint-disable-next-line max-len
const billingAgreement = Promise.promisifyAll(paypal.billingAgreement, { context: paypal.billingAgreement });

// internal context will be created for promise execution
function sendRequest() {
  return billingAgreement
    .executeAsync(this.token, {}, this.paypal)
    .catch((err) => {
      throw new HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
    })
    .get('id');
}

function fetchUpdatedAgreement(id) {
  return billingAgreement.getAsync(id, this.paypal);
}

function fetchPlan(agreement) {
  return this.service.redis.hgetall(this.tokenKey)
    .then(data => ({ ...data, agreement }));
}

function fetchSubscription(data) {
  const { planId, agreement, owner } = data;
  const subscriptionName = agreement.plan.payment_definitions[0].frequency.toLowerCase();

  return getPlan.call(this.service, { params: planId }).then((plan) => {
    const subscription = find(plan.subs, { name: subscriptionName });
    return { agreement, subscription, planId, owner };
  });
}

function getCurrentAgreement(data) {
  const { prefix, postfix, audience } = this.users;
  const path = `${prefix}.${postfix.getMetadata}`;
  const getRequest = {
    username: data.owner,
    audience,
  };

  return this.service
    .amqp
    .publishAndWait(path, getRequest, { timeout: 5000 })
    .get(audience)
    .then(metadata => ({
      data,
      oldAgreement: metadata.agreement,
      subscriptionInterval: metadata.subscriptionInterval,
    }));
}

function syncTransactions({ agreement, owner, subscriptionInterval }) {
  return pullTransactionsData
    .call(this.service, {
      params: {
        id: agreement.id,
        owner,
        start: moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD'),
        end: moment().add(1, 'day').format('YYYY-MM-DD'),
      },
    })
    .return(agreement);
}

function checkAndDeleteAgreement(input) {
  const { data, oldAgreement } = input;

  this.log.info('checking agreement data %j', input);

  if (oldAgreement && oldAgreement !== FREE_PLAN_ID && oldAgreement !== data.agreement.id) {
    // should we really cancel the agreement?
    this.log.warn('cancelling agreement %s, because of new agreement %j', oldAgreement, data.agreement);

    // remove old agreement if setting new one
    return setState
      .call(this.service, {
        params: {
          owner: data.owner,
          state: 'cancel',
        },
      })
      .catch({ statusCode: 400 }, (err) => {
        this.log.warn('oldAgreement was already cancelled', err);
      })
      .return(input);
  }

  return input;
}

function updateMetadata({ data, subscriptionInterval }) {
  const { subscription, agreement, planId, owner } = data;
  const { prefix, postfix, audience } = this.users;
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

  return this.service.amqp
    .publishAndWait(path, updateRequest, { timeout: 5000 })
    .return({ agreement, owner, planId, subscriptionInterval });
}

function updateRedis({ agreement, owner, planId, subscriptionInterval }) {
  const agreementKey = key(AGREEMENT_DATA, agreement.id);
  const userAgreementIndex = key(AGREEMENT_INDEX, owner);
  const pipeline = this.service.redis.pipeline();

  const data = {
    agreement,
    state: agreement.state,
    token: this.token,
    plan: planId,
    owner,
  };

  pipeline.hmset(agreementKey, serialize(data));
  pipeline.sadd(AGREEMENT_INDEX, agreement.id);
  pipeline.sadd(userAgreementIndex, agreement.id);
  pipeline.del(this.tokenKey);

  return pipeline.exec().return({ agreement, owner, subscriptionInterval });
}

function verifyToken() {
  return this.redis
    .exists(this.tokenKey)
    .then((exists) => {
      if (!exists) throw new HttpStatusError(404, `subscription token ${this.token} was not found`);
    });
}

function agreementExecute({ params }) {
  const { config } = this;
  const { token } = params;

  return Promise
    .bind({
      token,
      log: this.log,
      users: config.users,
      paypal: config.paypal,
      tokenKey: key('subscription-token', token),
      service: this,
      amqp: this.amqp,
      redis: this.redis,
    })
    .then(verifyToken)
    .then(sendRequest)
    .then(fetchUpdatedAgreement)
    .then(fetchPlan)
    .then(fetchSubscription)
    .then(getCurrentAgreement)
    .then(checkAndDeleteAgreement)
    .then(updateMetadata)
    .then(updateRedis)
    .then(syncTransactions);
}

module.exports = agreementExecute;
