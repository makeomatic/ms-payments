const mixPlan = require('./mixPlan.js');

module.exports = {
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
};
