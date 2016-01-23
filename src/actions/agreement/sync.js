const moment = require('moment');
const Promise = require('bluebird');

const bill = require('./bill');
const forUser = require('./forUser');

function agreementSync() {
  const { _config, amqp } = this;
  const { users: { prefix, postfix } } = _config;

  // 1. get users
  function getUsers() {
    // give 1 hour for payments to proceed
    const current = moment().subtract(1, 'hour').valueOf();
    const path = `${prefix}.${postfix.list}`;
    const getRequest = {
      filter: {
        nextCycle: {
          lte: current,
        },
      },
    };

    return amqp.publishAndWait(path, getRequest, { timeout: 5000 }).get('users');
  }

  // 2. bill users
  function billUsers(users) {
    return Promise.map(users, user => (
      forUser({ user: user.id }).then(userData => (
        bill(userData.agreement)
      ))
    ));
  }

  return getUsers().bind(this).then(billUsers);
}

module.exports = agreementSync;
