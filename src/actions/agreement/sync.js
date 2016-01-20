const moment = require('moment');
const Promise = require('bluebird');
const Errors = require('common-errors');

const bill = require('./bill');
const forUser = require('./forUser');

function agreementSync() {
  const { _config, amqp } = this;
  // 1. get users
  function getUsers() {
    // give 1 hour for payments to proceed
    const current = moment().subtract(1, 'hour').valueOf();
    const path = _config.users.prefix + '.' + _config.users.postfix.list;
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
    Promise.map(users, function billUser(user) {
      return forUser({ user: user.id }).then(function performBill(u) {
        return bill(u.agreement);
      });
    });
  }

  return Promise.bind(this).then(getUsers).then(billUsers);
}

module.exports = agreementSync;
