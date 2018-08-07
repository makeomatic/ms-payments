const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const moment = require('moment');
const find = require('lodash/find');

// helpers
const key = require('../../redisKey');
const { AGREEMENT_INDEX, AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');
const { serialize, deserialize } = require('../../utils/redis');
const { mergeWithNotNull } = require('../../utils/plans');

// internal actions
const { agreement: { execute, get: getAgreement }, handleError } = require('../../utils/paypal');
const pullTransactionsData = require('../transaction/sync.js');
const setState = require('./state');
const getPlan = require('../plan/get');

function sendRequest() {
  return execute(this.token, {}, this.paypal).catch(handleError).get('id');
}

/**
 * Fetches updated agreement from paypal.
 * We must make sure that state is 'active'.
 * If it's pending -> retry until it becomes either active or cancelled
 * States: // Active, Cancelled, Completed, Created, Pending, Reactivated, or Suspended
 * @param  {string} id - Agreement Id.
 */
function fetchUpdatedAgreement(id, attempt = 0) {
  return getAgreement(id, this.paypal).then((agreement) => {
    const state = String(agreement.state).toLowerCase();

    if (state === 'active') {
      return agreement;
    }

    if (state === 'pending') {
      if (attempt > 20) {
        throw new HttpStatusError(504, 'paypal agreement stuck in pending state');
      }

      return Promise
        .bind(this, [id, attempt + 1])
        .delay(250)
        .spread(fetchUpdatedAgreement);
    }

    this.log.error('Client tried to execute failed agreement: %j', agreement);

    throw new HttpStatusError(412, `paypal agreement in state: ${state}, not "active"`);
  });
}

function fetchPlan(agreement) {
  return this.service.redis.hgetall(this.tokenKey)
    .then(deserialize)
    .then((data) => {
      const { owner, planId, plan } = data;

      return {
        owner,
        planId,
        agreement: {
          ...agreement,
          plan: mergeWithNotNull(plan, agreement.plan),
        },
      };
    });
}

function fetchSubscription(data) {
  const { planId, agreement, owner } = data;
  const subscriptionName = agreement.plan.payment_definitions[0].frequency.toLowerCase();

  return getPlan.call(this.service, { params: planId }).then((plan) => {
    const subscription = find(plan.subs, { name: subscriptionName });
    return {
      agreement, subscription, planId, owner,
    };
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
      subscriptionType: metadata.subscriptionType,
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
  const { data, oldAgreement, subscriptionType } = input;

  this.log.info('checking agreement data %j', input);
  const oldAgreementIsNotFree = oldAgreement !== FREE_PLAN_ID;
  const oldAgreementIsNotNew = oldAgreement !== data.agreement.id;
  const oldAgreementIsPresent = oldAgreement && oldAgreementIsNotFree && oldAgreementIsNotNew;
  const subscriptionTypeIsPaypal = subscriptionType == null || subscriptionType === 'paypal';

  if (oldAgreementIsPresent && subscriptionTypeIsPaypal) {
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
  const {
    subscription, agreement, planId, owner,
  } = data;
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
        subscriptionType: 'paypal',
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
    .return({
      agreement, owner, planId, subscriptionInterval,
    });
}

function updateRedis({
  agreement, owner, planId, subscriptionInterval,
}) {
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
      if (!exists) {
        throw new HttpStatusError(404, `subscription token ${this.token} was not found`);
      }

      return true;
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
