const mixPlan = require('./mixPlan.js');

module.exports = {
  logger: {
    defaultLogger: true,
    debug: true,
  },
  admins: [
    {
      username: 'test@test.ru',
      password: 'megalongsuperpasswordfortest',
      firstName: 'Unit',
      lastName: 'Test',
    },
    {
      username: 'pristine@test.ru',
      password: 'megalongsuperpasswordfortest',
      firstName: 'Pristine',
      lastName: 'Test',
    },
  ],
  hooks: {
    'users:activate': mixPlan,
  },
  oauth: {
    providers: {
      facebook: {
        password: Array.from({ length: 64 }).join('_'),
      },
    },
  },
};
