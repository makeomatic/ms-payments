const moment = require('moment');
const bill = require('./bill');
const FETCH_USERS_LIMIT = 20;

function agreementSync(message) {
  const { _config, amqp } = this;
  const { users: { prefix, postfix, audience } } = _config;
  const pool = [];

  // 1. get users recursively
  // it won't be too many of them, and when it will - we are lucky :)
  function getUsers(opts = {}) {
    // give 1 hour for payments to proceed
    const current = opts.start || message.start || moment().subtract(1, 'hour').valueOf();
    const path = `${prefix}.${postfix.list}`;
    const getRequest = {
      audience,
      offset: opts.cursor || message.cursor || 0,
      limit: FETCH_USERS_LIMIT,
      filter: {
        nextCycle: {
          lte: current,
        },
      },
    };

    return amqp
      .publishAndWait(path, getRequest, { timeout: 5000 })
      .then(response => {
        const { users, cursor, page, pages } = response;
        pool.push(...users);

        if (page < pages) {
          return getUsers({ start: current, offset: cursor });
        }

        return pool;
      });
  }

  // 2. bill users
  const billUser = user => {
    const agreement = user.metadata[audience].agreement;
    return bill.call(this, agreement);
  };

  return getUsers().map(billUser);
}

module.exports = agreementSync;
