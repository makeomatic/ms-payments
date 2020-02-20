const assert = require('assert');
const { ActionTransport } = require('@microfleet/core');
const { NotPermitted, HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const moment = require('moment');
const getValue = require('get-value');

// helpers
const key = require('../../redis-key');
const resetToFreePlan = require('../../utils/reset-to-free-plan');
const { hmget } = require('../../list-utils');

// constants
const {
  AGREEMENT_DATA,
  AGREEMENT_KEYS,
  FREE_PLAN_ID,
  PLANS_DATA,
  PLAN_KEYS,
} = require('../../constants');

const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);
const planParser = hmget(PLAN_KEYS, JSON.parse, JSON);
const kValidTxStatuses = {
  completed: true,
};

/**
 * Parses agreement data retrieved from redis
 * @param  {Object} service - current microfleet
 * @param  {String} agreementId - agreement id
 * @return {Object} agreement
 */
async function parseAgreementData(service, agreementId) {
  const { redis, log } = service;
  const agreementKey = key(AGREEMENT_DATA, agreementId);
  const data = await redis.hmget(agreementKey, AGREEMENT_KEYS);

  try {
    const parsed = agreementParser(data);

    // assign owner
    parsed.agreement.owner = parsed.owner;

    // FIXME: PAYPAL agreement doesn't have embedded plan id...
    // bug in paypal
    parsed.agreement.plan.id = parsed.plan;

    // return data
    return parsed;
  } catch (e) {
    log.error({
      err: e,
      keys: AGREEMENT_KEYS,
      source: String(data),
      agreementKey,
    }, 'failed to fetch agreement data');

    throw e;
  }
}

const freeAgreementForUser = (username) => ({
  owner: username,
  plan: {
    id: FREE_PLAN_ID,
  },
});

const bannedStates = ['cancelled', 'suspended'];
const verifyAgreementState = (state) => {
  // verify state
  if (!state || bannedStates.includes(state.toLowerCase())) {
    throw new NotPermitted(`Operation not permitted on "${state}" agreements.`);
  }
};

/**
 * Retrieves agreement data from redis & parses it
 * @return {object} Agreement
 */
async function getAgreement(ctx) {
  const { service, params } = ctx;
  const { agreement: agreementId, username } = params;

  if (agreementId === FREE_PLAN_ID) {
    return freeAgreementForUser(username);
  }

  // parsed correctly
  const { agreement, state } = await parseAgreementData(service, agreementId);
  verifyAgreementState(state);
  console.log('\n___agreement___\n', agreement); // object.

  return agreement;
}

/**
 * Retrieves associated plan for requested agreement
 * @return {Object} { plan, subs }
 */
const getPlan = async (ctx, agreement) => {
  const { service, params } = ctx;
  const { username } = params;
  const { redis, log } = service;

  const planKey = key(PLANS_DATA, agreement.plan.id);
  const response = await redis.hmget(planKey, PLAN_KEYS);

  try {
    const { subs } = planParser(response);
    assert(subs, 'subs not present');
    return subs;
  } catch (e) {
    log.error({ response, planKey, username }, 'failed to fetch plan in redis');
    throw e;
  }
};

// fetch transactions from paypal
const getTransactions = async (ctx, agreement) => {
  const { service, start, end, params } = ctx;
  const { agreement: id } = params;

  if (agreement.plan.id === FREE_PLAN_ID) {
    return {};
  }

  const agreementData = await service.dispatch('transaction.sync', {
    params: {
      id,
      start,
      end,
    },
  });

  return agreementData;
};

// bill next free cycle
const prepareFreeCycles = (ctx) => {
  const { params } = ctx;

  const nextCycle = moment(params.nextCycle);
  const current = moment();

  // determine how many free cycles and next billing date
  ctx.nextCycle = nextCycle;
  ctx.cyclesBilled = Number(nextCycle.isBefore(current));

  // if we missed many cycles
  if (ctx.cyclesBilled) {
    while (nextCycle.isBefore(current)) {
      nextCycle.add(1, 'month');
    }
  }
};

function preparePaidCycles(ctx, details) {
  const { params } = ctx;

  // agreement nextCycle date
  const nextCycle = moment(details.agreement.agreement_details.next_billing_date || params.nextCycle);
  const currentCycle = moment(params.nextCycle).subtract(1, 'day');
  const { transactions } = details;

  // determine how many paid cycles and next billing date
  ctx.nextCycle = nextCycle;
  ctx.cyclesBilled = transactions.reduce((acc, it) => {
    const status = it.status && it.status.toLowerCase();

    // TODO: does paypal charge earlier?
    // we need to filter out setup fee
    if (kValidTxStatuses[status] && moment(it.time_stamp).isAfter(currentCycle)) {
      return acc + 1;
    }

    return acc;
  }, 0);
}

// determine how many cycles and next billing date
// i.e. it fills in ctx the nextCycle and cyclesBilled
const prepareBillingCyclesParams = (ctx, agreement, details) => {
  if (agreement.plan.id === FREE_PLAN_ID) {
    return prepareFreeCycles(ctx);
  }

  if (details.transactions.length === 0) {
    // no outstanding transactions
    ctx.shouldUpdate = false;
    return false;
  }

  return preparePaidCycles(ctx, details);
};

const saveToRedis = async (ctx, agreement, sub) => {
  const { usersUpdateMetadataRoute, usersUpdateMetadataTimeout, service, audience } = ctx;
  const { amqp } = service;

  // no updates yet - skip to next
  if (ctx.shouldUpdate === false) {
    return 'OK';
  }

  const models = sub.models * ctx.cyclesBilled;

  const updateRequest = {
    username: agreement.owner,
    audience,
    metadata: {
      $set: {
        nextCycle: ctx.nextCycle.valueOf(),
      },
      $incr: {
        models,
      },
    },
  };

  await amqp.publishAndWait(usersUpdateMetadataRoute, updateRequest, { timeout: usersUpdateMetadataTimeout });

  return 'OK';
};

async function agreementBill({ log, params }) {
  const { agreement: id, subscriptionInterval, username } = params;
  const { config } = this;
  const { users: { prefix, postfix, timeouts } } = config;
  const start = moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD');
  const end = moment().add(1, 'day').format('YYYY-MM-DD');

  log.debug('billing %s on %s', username, id);

  const ctx = {
    service: this,
    log,

    // used params
    start,
    end,
    params,
    audience: config.users.audience,

    // pre-calculated vars
    usersUpdateMetadataRoute: `${prefix}.${postfix.updateMetadata}`,
    usersUpdateMetadataTimeout: timeouts.updateMetadata,
  };

  try {
    const agreement = await getAgreement(ctx);

    const [subs, details] = await Promise.all([
      getPlan(ctx, agreement),
      getTransactions(ctx, agreement),
    ]);

    const planFreq = getValue(agreement, 'plan.payment_definitions[0].frequency', 'month').toLowerCase();
    const sub = subs.find((x) => x.name === planFreq);
    if (!sub) {
      ctx.log.error({ subs, agreement, planFreq }, 'failed to fetch subs');
      throw new HttpStatusError(500, 'internal application error');
    }

    prepareBillingCyclesParams(ctx, agreement, details);

    return await saveToRedis(ctx, agreement, sub);
  } catch (e) {
    if (e instanceof NotPermitted) {
      log.warn({ err: e }, 'Agreement %s was cancelled by user %s', username, id);
      return resetToFreePlan.call(this, username);
    }

    if (e.statusCode === 400 && e.message === 'The profile ID is invalid') {
      return resetToFreePlan.call(this, username);
    }

    log.warn({ err: e }, 'Failed to sync', username, id);
    throw e;
  }
}

agreementBill.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = agreementBill;
