const mixPlan = require('./mix-plan');

module.exports = {
  logger: {
    defaultLogger: true,
    debug: true,
  },
  admins: [
    {
      alias: 'admin0',
      username: 'test@test.ru',
      password: 'megalongsuperpasswordfortest',
      firstName: 'Unit',
      lastName: 'Test',
    },
    {
      alias: 'admin1',
      username: 'pristine@test.ru',
      password: 'megalongsuperpasswordfortest',
      firstName: 'Pristine',
      lastName: 'Test',
    },
    {
      alias: 'user0',
      username: 'user0@test.com',
      password: 'megalongsuperpasswordfortest',
      firstName: 'Im',
      lastName: 'User0',
      roles: [],
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
  // delete this
  plugins: [
    'logger',
    'validator',
    'router',
    'amqp',
    'redisSentinel',
    'http',
  ],
};
