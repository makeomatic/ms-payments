const Promise = require('bluebird');
const moment = require('moment');
const find = require('lodash/find');

exports.duration = 50 * 30 * 3 * 1000;

exports.simpleDispatcher = function simpleDispatcher(service) {
  return function dispatch(route, params) {
    return service.amqp.publishAndWait(route, params, { timeout: exports.duration * 2 });
  };
};

exports.clearRedis = function clearRedis(redis) {
  if (redis.nodes) {
    const nodes = redis.nodes('master');

    return Promise
      .map(nodes, (node) => node.flushdb())
      .reflect();
  }

  return redis.flushdb();
};

async function updateUserMetadata(service, owner, subscription, agreement, planId) {
  const { prefix, postfix, audience } = service.config.users;
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

  await service.amqp
    .publishAndWait(path, updateRequest, { timeout: 5000 });
}

/**
 * Temporary workaround. To remove writes to ms-users, but still support read operations,
 * I request metadata update outside of the agreement execute logic.
 * In future, we must pass user everywhere instead of fetching it from ms-users by agreement id.
 */
async function afterAgreementExecution(service, dispatch, agreement, planId) {
  const subscriptionName = agreement.plan.payment_definitions[0].frequency.toLowerCase();
  const plan = await dispatch('payments.plan.get', planId);
  const subscription = find(plan.subs, { name: subscriptionName });
  await updateUserMetadata(service, 'test@test.ru', subscription, agreement, planId);
}

exports.afterAgreementExecution = afterAgreementExecution;
