const { FREE_PLAN_ID } = require('../constants');

module.exports = function resetToFreePlan(owner) {
  const { config, amqp } = this;
  const { users: { prefix, postfix, audience } } = config;

  // delete agreement and set user to 'free' agreement
  const path = `${prefix}.${postfix.updateMetadata}`;
  const updateRequest = {
    username: owner,
    audience,
    metadata: {
      $set: {
        agreement: FREE_PLAN_ID,
        plan: FREE_PLAN_ID,
        subscriptionPrice: '0.00',
        subscriptionInterval: 'month',
        modelPrice: config.defaultPlans.find((x) => x.id === FREE_PLAN_ID).subscriptions[0].price,
      },
      $remove: ['subscriptionType'],
    },
  };

  return amqp.publishAndWait(path, updateRequest, { timeout: 15000 });
};
