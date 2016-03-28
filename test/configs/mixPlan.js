const ld = require('../node_modules/lodash');
const moment = require('../node_modules/moment');
const setMetadata = require('../lib/utils/updateMetadata.js');
const FREE_PLAN_ID = 'free';

module.exports = exports = function mixPlan(username, audience) {
  const id = FREE_PLAN_ID;
  const plan = {
    plan: {
      name: FREE_PLAN_ID,
      description: 'Default free plan',
      type: 'infinite',
      state: 'active',
      payment_definitions: [{
        name: FREE_PLAN_ID,
        type: 'regular',
        frequency: 'month',
        frequency_interval: '1',
        cycles: '0',
        amount: { currency: 'USD', value: '0' },
      }],
      id: FREE_PLAN_ID,
      hidden: false,
    },
    subs: [{
      name: 'month',
      models: 100,
      price: 0.5,
      definition: {
        name: FREE_PLAN_ID,
        type: 'regular',
        frequency: 'month',
        frequency_interval: '1',
        cycles: '0',
        amount: { currency: 'USD', value: '0' },
      },
    }],
    alias: FREE_PLAN_ID,
    hidden: false,
  };

  const subscription = ld.find(plan.subs, { name: 'month' });
  const nextCycle = moment().add(1, 'month').format();
  const update = {
    username,
    audience,
    metadata: {
      $set: {
        plan: id,
        agreement: id,
        nextCycle,
        models: subscription.models,
        modelPrice: subscription.price,
        subscriptionInterval: 'month',
        subscriptionPrice: '0.00',
      },
    },
  };

  return setMetadata.call(this, update);
};
