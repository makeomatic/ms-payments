const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const moment = require('moment');
const find = require('lodash/find');

// helpers
const key = require('../../redis-key');
const { AGREEMENT_INDEX, AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');
const { serialize, deserialize, handlePipeline } = require('../../utils/redis');
const { mergeWithNotNull } = require('../../utils/plans');

// internal actions
const { agreement: { execute, get: getAgreement }, handleError } = require('../../utils/paypal');

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
async function fetchUpdatedAgreement(id, attempt = 0) {
  const agreement = await getAgreement(id, this.paypal);
  this.log.debug('fetched agreement %j', agreement);
  const state = String(agreement.state).toLowerCase();

  if (state === 'active') {
    return agreement;
  }

  if (state === 'pending') {
    if (attempt > 20) {
      this.log.warn({ agreement }, 'failed to move agreement to active/failed state');
      return agreement;
    }

    return Promise
      .bind(this, [id, attempt + 1])
      .delay(250)
      .spread(fetchUpdatedAgreement);
  }

  this.log.error({ agreement }, 'Client tried to execute failed agreement: %j');
  throw new HttpStatusError(412, `paypal agreement in state: ${state}, not "active"`);
}

async function fetchPlan(agreement) {
  const data = await this.service
    .redis
    .hgetall(this.tokenKey)
    .then(deserialize);

  this.log.info({ data, token: this.tokenKey }, 'fetched plan for token');

  return {
    owner: data.owner,
    planId: data.planId,
    agreement: {
      ...agreement,
      plan: mergeWithNotNull(data.plan, agreement.plan),
    },
  };
}

async function fetchSubscription(data) {
  const { planId, agreement, owner } = data;
  const subscriptionName = agreement.plan.payment_definitions[0].frequency.toLowerCase();

  this.log.info({ data }, 'fetch subscription');

  const plan = await this.service.dispatch('plan.get', { params: planId });
  const subscription = find(plan.subs, { name: subscriptionName });

  return {
    agreement,
    subscription,
    planId,
    owner,
  };
}

async function getCurrentAgreement(data) {
  const { prefix, postfix, audience } = this.users;
  const path = `${prefix}.${postfix.getMetadata}`;
  const getRequest = {
    username: data.owner,
    audience,
  };

  const metadata = await this.service
    .amqp
    .publishAndWait(path, getRequest, { timeout: 10000 })
    .get(audience);

  return {
    data,
    oldAgreement: metadata.agreement,
    subscriptionType: metadata.subscriptionType,
    subscriptionInterval: metadata.subscriptionInterval,
  };
}

async function syncTransactions({ agreement, owner, subscriptionInterval }) {
  await this.service.dispatch('transaction.sync', {
    params: {
      id: agreement.id,
      owner,
      start: moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD'),
      end: moment().add(1, 'day').format('YYYY-MM-DD'),
    },
  });

  return agreement;
}

async function checkAndDeleteAgreement(input) {
  const { data, oldAgreement, subscriptionType } = input;

  this.log.info(input, 'checking agreement data');

  const oldAgreementIsNotFree = oldAgreement !== FREE_PLAN_ID;
  const oldAgreementIsNotNew = oldAgreement !== data.agreement.id;
  const oldAgreementIsPresent = oldAgreement && oldAgreementIsNotFree && oldAgreementIsNotNew;
  const subscriptionTypeIsPaypal = subscriptionType == null || subscriptionType === 'paypal';

  if (oldAgreementIsPresent && subscriptionTypeIsPaypal) {
    // should we really cancel the agreement?
    this.log.warn({ oldAgreement, agreement: data.agreement }, 'cancelling old agreement because of new agreement');

    await this.service.dispatch('agreement.state', {
      params: {
        owner: data.owner,
        state: 'cancel',
      },
    }).catch({ statusCode: 400 }, (err) => {
      this.log.warn({ err }, 'oldAgreement was already cancelled');
    });
  }

  return input;
}

async function updateMetadata({ data, subscriptionInterval }) {
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
        subscriptionType: 'paypal',
        subscriptionPrice: agreement.plan.payment_definitions[0].amount.value,
        subscriptionInterval: agreement.plan.payment_definitions[0].frequency.toLowerCase(),
      },
      $incr: {
        models: subscription.models,
      },
    },
  };

  await this.service.amqp
    .publishAndWait(path, updateRequest, { timeout: 15000 });

  return { agreement, owner, planId, subscriptionInterval };
}

async function updateRedis({ agreement, owner, planId, subscriptionInterval }) {
  const agreementKey = key(AGREEMENT_DATA, agreement.id);
  const userAgreementIndex = key(AGREEMENT_INDEX, owner);

  const data = {
    agreement,
    state: agreement.state,
    token: this.token,
    plan: planId,
    owner,
  };

  const pipeline = this.service.redis.pipeline([
    ['hmset', agreementKey, serialize(data)],
    ['sadd', AGREEMENT_INDEX, agreement.id],
    ['sadd', userAgreementIndex, agreement.id],
    ['del', this.tokenKey],
  ]);

  handlePipeline(await pipeline.exec());

  return { agreement, owner, subscriptionInterval };
}

async function verifyToken() {
  const [exists, data] = await this.redis
    .pipeline()
    .exists(this.tokenKey)
    .hgetall(this.tokenKey)
    .exec()
    .then(handlePipeline);

  if (!exists) {
    throw new HttpStatusError(404, `subscription token ${this.token} was not found`);
  }

  this.log = this.log.child({ agreementData: deserialize(data) });
  this.log.info('verify token succeeded');

  return true;
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

agreementExecute.transports = [ActionTransport.amqp];

module.exports = agreementExecute;
