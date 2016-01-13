const mixPlan = require('./mixPlan.js');

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
    'users:activate': mixPlan,
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
