const Promise = require('bluebird');
const moment = require('moment');
const { ActionTransport } = require('@microfleet/core');
const { FETCH_USERS_LIMIT,
  AGREEMENT_PENDING_STATUS,
  AGREEMENT_PENDING_STATUS_CAPITAL,
  SUBSCRIPTION_TYPE_CAPP,
} = require('../../constants');

// 1. Get pool of users metadata who have typical subscription (recursively)
async function preparePoolUsersMetadata(opts = {}) {
  const { audience, amqp, usersListRoute, usersListTimeout, usersWithSubscription, poolUsersMetadata } = this;

  // give 5 minutes based on due date
  const current = opts.start || moment().subtract(5, 'minutes').valueOf();
  const getUsersBySubscriptionTypeRequest = {
    audience,
    offset: opts.cursor || 0,
    limit: FETCH_USERS_LIMIT,
    filter: {
      nextCycle: {
        lte: current,
      },
      subscriptionType: {
        ne: SUBSCRIPTION_TYPE_CAPP,
      },
    },
  };

  const response = await amqp
    .publishAndWait(usersListRoute, getUsersBySubscriptionTypeRequest, { timeout: usersListTimeout });

  const { users, cursor, page, pages } = response;

  for (const user of users) {
    usersWithSubscription.add(user.id);
    poolUsersMetadata.push(user);
  }

  if (page < pages) {
    return preparePoolUsersMetadata.call(this, { start: current, cursor });
  }

  return poolUsersMetadata;
}

// 2. Add to pool of users metadata users with pending agreements
async function fetchPendingAgreementsAndUpdatePoolUsersMetadata(opts = {}) {
  const { amqp, audience, service, usersMetadataRoute, usersMetadataTimeout, poolUsersMetadata, usersWithSubscription, usersToProcess } = this;
  const offset = opts.cursor || 0;

  const pendingAgreementsList = await service.dispatch('agreement.list', {
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

  const { items: agreements, cursor, page, pages } = pendingAgreementsList;

  for (const { owner } of agreements) {
    if (!usersWithSubscription.has(owner)) {
      usersToProcess.add(owner);
    }
  }

  if (page < pages) {
    return fetchPendingAgreementsAndUpdatePoolUsersMetadata.call(this, { cursor });
  }

  if (usersToProcess.size === 0) {
    return null;
  }

  return Promise.map(usersToProcess, async (username) => {
    const request = { username, audience };
    const metadata = await amqp
      .publishAndWait(usersMetadataRoute, request, { timeout: usersMetadataTimeout });

    poolUsersMetadata.push({ id: username, metadata });
  }, { concurrency: 10 });
}

// 3. Bill the prepared pool of users metadata
async function bill(user) {
  const meta = user.metadata[this.audience];
  const params = { ...meta, username: user.id };
  try {
    return await this.service.dispatch('agreement.bill', { params });
  } catch (err) {
    this.log.error({ params, err }, 'failed to bill during agreement sync');
  }

  return null;
}

async function agreementSync({ params = {} }) {
  const { config, amqp, log } = this;
  const { users: { prefix, postfix, audience, timeouts } } = config;
  const ctx = {
    amqp,
    log,
    config,
    service: this,

    audience,
    usersListRoute: `${prefix}.${postfix.list}`,
    usersMetadataRoute: `${prefix}.${postfix.getMetadata}`,
    usersMetadataTimeout: timeouts.getMetadata,
    usersWithSubscription: new Set(),
    usersToProcess: new Set(),
    poolUsersMetadata: [],
  };

  await preparePoolUsersMetadata.call(ctx, { ...params });
  log.info('fetched %d users', ctx.poolUsersMetadata.length);

  await fetchPendingAgreementsAndUpdatePoolUsersMetadata.call(ctx);
  log.info('prepared %d users to bill (with those who have pending agreements)', ctx.poolUsersMetadata.length);

  return Promise.bind(ctx, ctx.poolUsersMetadata)
    .map(bill, { concurrency: 10 });
}

agreementSync.transports = [ActionTransport.amqp];

module.exports = agreementSync;
