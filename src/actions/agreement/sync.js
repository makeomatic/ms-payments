const Promise = require('bluebird');
const moment = require('moment');
const { ActionTransport } = require('@microfleet/core');

// constants
const FETCH_USERS_LIMIT = 20;
const AGREEMENT_PENDING_STATUS = JSON.stringify('pending');
const AGREEMENT_PENDING_STATUS_CAPITAL = JSON.stringify('Pending');
const SUBSCRIPTION_TYPE = JSON.stringify('capp');

// 1. get users recursively
// it won't be too many of them, and when it will - we are lucky :)
async function getUsers(opts = {}) {
  const { audience, amqp, usersList, pulledUsers, pool } = this;

  // give 5 minutes based on due date
  const current = opts.start || moment().subtract(5, 'minutes').valueOf();
  const getRequest = {
    audience,
    offset: opts.cursor || 0,
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

  const response = await amqp
    .publishAndWait(usersList, getRequest, { timeout: 10000 });

  const { users, cursor, page, pages } = response;

  for (const user of users) {
    pulledUsers.add(user.id);
    pool.push(user);
  }

  if (page < pages) {
    return getUsers.call(this, { start: current, cursor });
  }

  return pool;
}

// fetch pending agreements
async function getPendingAgreements(opts = {}) {
  const { amqp, audience, service, getMetadata, pool, pulledUsers, missingUsers } = this;
  const offset = opts.cursor || 0;

  const response = await service.dispatch('agreement.list', {
    params: {
      offset,
      limit: FETCH_USERS_LIMIT,
      filter: {
        state: {
          some: [AGREEMENT_PENDING_STATUS, AGREEMENT_PENDING_STATUS_CAPITAL],
        },
      },
    },
  });

  const { items: agreements, cursor, page, pages } = response;

  for (const agreement of agreements) {
    const { owner } = agreement;
    if (!pulledUsers.has(owner)) {
      missingUsers.add(owner);
    }
  }

  if (page < pages) {
    return getPendingAgreements.call(this, { cursor });
  }

  if (missingUsers.size === 0) {
    return null;
  }

  return Promise.map(missingUsers, async (username) => {
    const request = { username, audience };
    const metadata = await amqp
      .publishAndWait(getMetadata, request, { timeout: 10000 });

    pool.push({ id: username, metadata });
  }, { concurrency: 10 });
}

// 3. bill users
async function billUser(user) {
  const meta = user.metadata[this.audience];
  const params = { ...meta, username: user.id };
  try {
    return await this.service.dispatch('agreement.bill', { params });
  } catch (e) {
    this.log.error({ params }, 'failed to bill during agreement sync');
  }

  return null;
}

async function agreementSync({ params = {} }) {
  const { config, amqp, log } = this;
  const { users: { prefix, postfix, audience } } = config;

  const ctx = {
    amqp,
    log,
    config,
    service: this,

    audience,
    usersList: `${prefix}.${postfix.list}`,
    getMetadata: `${prefix}.${postfix.getMetadata}`,
    pulledUsers: new Set(),
    missingUsers: new Set(),
    pool: [],
  };

  const users = await getUsers.call(ctx, { ...params });
  log.info('fetched %d users to bill', users.length);

  await getPendingAgreements.call(ctx);
  log.info('processed pending agreements');

  /* to not add too much load */
  return Promise.bind(ctx, users)
    .map(billUser, { concurrency: 10 });
}

agreementSync.transports = [ActionTransport.amqp];

module.exports = agreementSync;
