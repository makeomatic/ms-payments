const ld = require('../node_modules/lodash');
const moment = require('../node_modules/moment');
const setMetadata = require('../ms-users/lib/utils/updateMetadata.js');

module.exports = {
  server: {
    proto: 'https',
    host: 'api-sandbox.cappasity.matic.ninja',
    port: 443,
  },
  validation: {
    paths: {
      activate: '/activate',
      reset: '/reset',
    },
    subjects: {
      activate: 'Activate your account',
      reset: 'Reset your password',
    },
    templates: {
      password: 'cappasity-password',
      activate: 'cappasity-activate',
    },
    senders: {
      activate: 'Cappasity Support <cappasity@makeomatic.co>',
      reset: 'Cappasity Support <cappasity@makeomatic.co>',
    },
    email: 'cappasity@makeomatic.co',
    jwt: {
      defaultAudience: '*.localhost',
      secret: '|TUjU0E-mc[x:Ma021:K1ZfJ5M}YRK',
      lockAfterAttempts: 10,
      keepLoginAttempts: 30 * 60, // 30 mins
    },
  },
  admins: [
    {
      username: 'test@test.ru',
      password: 'megalongsuperpasswordfortest',
      firstName: 'Unit',
      lastName: 'Test',
    },
  ],
  hooks: {
    'users:activate': function mixPlan(username, audience) {
      const config = this.config;
      const payments = config.payments;
      const id = 'free';
      const plan = {
        plan: {
          name: 'free',
          description: 'Default free plan',
          type: 'infinite',
          state: 'active',
          payment_definitions: [{
            name: 'free',
            type: 'regular',
            frequency: 'month',
            frequency_interval: '1',
            cycles: '0',
            amount: {currency: 'USD', value: '0'}
          }],
          id: 'free',
          hidden: false
        },
        subs: [{
          name: 'month',
          models: 100,
          price: 0.5,
          definition: {
            name: 'free',
            type: 'regular',
            frequency: 'month',
            frequency_interval: '1',
            cycles: '0',
            amount: {currency: 'USD', value: '0'}
          }
        }],
        alias: 'free',
        hidden: false
      };

      const subscription = ld.findWhere(plan.subs, {name: 'month'});
      const nextCycle = moment().add(1, 'month').format();
      const update = {
        username,
        audience,
        metadata: {
          '$set': {
            plan: id,
            agreement: id,
            nextCycle,
            models: subscription.models,
            modelPrice: subscription.price,
          },
        },
      };

      return setMetadata.call(this, update);
    },
  },
  mailer: {
    prefix: 'mailer',
    routes: {
      adhoc: 'adhoc',
      predefined: 'predefined',
    },
  },
  payments: {
    prefix: 'payments',
    routes: {
      getPlan: 'plan.get',
      createPlan: 'plan.create',
    },
  },
};
