const Promise = require('bluebird');
const moment = require('moment');
const { ActionTransport } = require('@microfleet/core');
const { AGR_TX_FIELD } = require('../../constants');

// constants
const FETCH_USERS_LIMIT = 20;
const AGREEMENT_PENDING_STATUS = JSON.stringify('pending');
const AGREEMENT_PENDING_STATUS_CAPITAL = JSON.stringify('Pending');
const AGREEMENT_ACTIVE_STATUS = JSON.stringify('active');
const AGREEMENT_ACTIVE_STATUS_CAPITAL = JSON.stringify('Active');
const SUBSCRIPTION_TYPE = JSON.stringify('capp');

// 1. get users recursively
// it won't be too many of them, and when it will - we are lucky :)
async function getUsers(ctx, opts = {}) {
  const { audience, amqp, usersList, pulledUsers, pool } = ctx;

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
    pool.set(user.id, user);
  }

  if (page < pages) {
    return getUsers(ctx, { start: current, cursor });
  }

  return pool;
}

// fetch pending agreements
async function getPendingAgreements(ctx, query, opts = {}) {
  const { service, pulledUsers, missingUsers } = ctx;
  const offset = opts.cursor || 0;

  const response = await service.dispatch('agreement.list', {
    params: {
      offset,
      limit: FETCH_USERS_LIMIT,
      filter: query,
    },
  });

  const { items: agreements, cursor, page, pages } = response;

  for (const { owner, agreement } of agreements) {
    if (!pulledUsers.has(owner)) {
      missingUsers.add(owner);
    }

    ctx.pendingAgreements.add(agreement.id);
  }

  if (page < pages) {
    return getPendingAgreements(ctx, { cursor });
  }

  return null;
}


// 3. bill users
async function billUser(ctx, user) {
  const meta = user.metadata[ctx.audience];
  const params = { ...meta, username: user.id };
  try {
    return await ctx.service.dispatch('agreement.bill', { params });
  } catch (err) {
    ctx.log.error({ params, err }, 'failed to bill during agreement sync');
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
    pendingAgreements: new Set(),
    pool: new Map(),
  };

  const users = await getUsers(ctx, { ...params });
  log.info('fetched %d users to bill', users.size);

  await Promise.all([
    // agreements stuck in pending status
    getPendingAgreements(ctx, {
      state: {
        some: [AGREEMENT_PENDING_STATUS, AGREEMENT_PENDING_STATUS_CAPITAL],
      },
    }),
    // agreements that are active, but have no associated transactions at all
    getPendingAgreements(ctx, {
      state: {
        some: [AGREEMENT_ACTIVE_STATUS, AGREEMENT_ACTIVE_STATUS_CAPITAL],
      },
      [AGR_TX_FIELD]: {
        isempty: 1,
      },
    }),
  ]);


  log.info({
    pendingAgreements: Array.from(ctx.pendingAgreements),
  }, 'fetched pending agreements: %s', ctx.pendingAgreements.size);

  if (ctx.missingUsers.size > 0) {
    await Promise.map(ctx.missingUsers, async (username) => {
      const request = { username, audience };
      const metadata = await amqp.publishAndWait(ctx.getMetadata, request, { timeout: 10000 });
      ctx.pool.set(username, { id: username, metadata });
    }, { concurrency: 10 });
  }

  /* to not add too much load */
  return Promise.map(users.values(), (user) => billUser(ctx, user), { concurrency: 10 });
}

agreementSync.transports = [ActionTransport.amqp];

module.exports = agreementSync;
