const Promise = require('bluebird');
const moment = require('moment');

// internal actions
const bill = require('./bill');
const listAgreements = require('./list.js');

// constants
const FETCH_USERS_LIMIT = 20;
const AGREEMENT_PENDING_STATUS = JSON.stringify('pending');
const SUBSCRIPTION_TYPE = JSON.stringify('capp');

function agreementSync({ params: message = {} }) {
  const { config, amqp, log } = this;
  const { users: { prefix, postfix, audience } } = config;
  const usersList = `${prefix}.${postfix.list}`;
  const getMetadata = `${prefix}.${postfix.getMetadata}`;
  const pulledUsers = new Set();
  const missingUsers = new Set();
  const pool = [];

  // 1. get users recursively
  // it won't be too many of them, and when it will - we are lucky :)
  function getUsers(opts = {}) {
    // give 5 minutes based on due date
    const current = opts.start || message.start || moment().subtract(5, 'minutes').valueOf();
    const getRequest = {
      audience,
      offset: opts.cursor || message.cursor || 0,
      limit: FETCH_USERS_LIMIT,
      filter: {
        nextCycle: {
          lte: current,
        },
        subscriptionType: {
          ne: SUBSCRIPTION_TYPE,
        },
      },
    };

    return amqp
      .publishAndWait(usersList, getRequest, { timeout: 5000 })
      .then((response) => {
        const {
          users,
          cursor,
          page,
          pages,
        } = response;

        users.forEach((user) => {
          pulledUsers.add(user.id);
          pool.push(user);
        });

        if (page < pages) {
          return getUsers({ start: current, cursor });
        }

        return pool;
      });
  }

  // fetch pending agreements
  function getPendingAgreements(opts = {}) {
    const offset = opts.cursor || 0;

    return listAgreements
      .call(this, {
        params: {
          offset,
          limit: FETCH_USERS_LIMIT,
          filter: {
            state: {
              match: AGREEMENT_PENDING_STATUS,
            },
          },
        },
      })
      .then((response) => {
        const {
          items: agreements, cursor, page, pages,
        } = response;

        agreements.forEach((agreement) => {
          const { owner } = agreement;
          if (!pulledUsers.has(owner)) {
            missingUsers.add(owner);
          }
        });

        if (page < pages) {
          return getPendingAgreements.call(this, { cursor });
        }

        if (missingUsers.size === 0) {
          return null;
        }

        return Promise.map(missingUsers, (username) => {
          const request = { username, audience };
          return amqp
            .publishAndWait(getMetadata, request, { timeout: 10000 })
            .then((metadata) => {
              pool.push({ id: username, metadata });
              return null;
            });
        });
      });
  }

  // 3. bill users
  const billUser = (user) => {
    const meta = user.metadata[audience];
    return bill.call(this, { params: { ...meta, username: user.id } });
  };

  return getUsers()
    .tap(() => getPendingAgreements.call(this))
    .tap((users) => {
      log.info('fetched %d users to bill', users.length);
    })
    .map(billUser, { concurrency: 10 }); /* to not add too much load */
}

module.exports = agreementSync;
