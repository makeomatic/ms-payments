const { ActionTransport } = require('@microfleet/core');
const { NotPermitted } = require('common-errors');
const Promise = require('bluebird');
const moment = require('moment');
const get = require('get-value');

// helpers
const key = require('../../redis-key');
const resetToFreePlan = require('../../utils/reset-to-free-plan');
const { hmget } = require('../../list-utils');
const { PLANS_DATA, AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');

// constants
const AGREEMENT_KEYS = ['agreement', 'plan', 'owner', 'state'];
const PLAN_KEYS = ['subs'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);
const planParser = hmget(PLAN_KEYS, JSON.parse, JSON);
const kValidTxStatuses = {
  completed: true,
};

/**
 * Parses agreement data retrieved from redis
 * @param  {Object} service - current microfleet
 * @param  {String} id - agreement id
 * @return {Object} agreement
 */
async function parseAgreementData(service, id) {
  const { redis, log } = service;
  const agreementKey = key(AGREEMENT_DATA, id);
  const data = await redis.hmgetBuffer(agreementKey, AGREEMENT_KEYS);

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

const verifyAgreementState = (state) => {
  // verify state
  if (!state || state.toLowerCase() === 'cancelled') {
    throw new NotPermitted('Operation not permitted on cancelled agreements.');
  }
};

/**
 * Retrieves agreement data from redis & parses it
 * @return {Agreement}
 */
async function getAgreement(ctx) {
  const { id, username, service } = ctx;

  if (id === FREE_PLAN_ID) {
    return freeAgreementForUser(username);
  }

  // parsed correctly
  const { agreement, state } = await parseAgreementData(service, id);
  verifyAgreementState(state);

  return agreement;
}

/**
 * Retrieves associated plan for requested agreement
 * @return {Object} { plan, subs }
 */
const getPlan = async (ctx, agreement) => {
  const { service, username } = ctx;
  const { redis, log } = service;

  const planKey = key(PLANS_DATA, agreement.plan.id);
  const response = await redis.hmgetBuffer(planKey, PLAN_KEYS);

  try {
    return planParser(response).subs;
  } catch (e) {
    log.error('failed to fetch plan in redis "%s" for owner "%s"', planKey, username);
    throw e;
  }
};

// fetch transactions from paypal
const getTransactions = async (ctx, agreement) => {
  const { service, id, start, end } = ctx;

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
const billNextFreeCycle = (ctx) => {
  const { params } = ctx;

  const nextCycle = moment(params.nextCycle);
  const current = moment();

  // 0 or 1
  ctx.cyclesBilled = Number(nextCycle.isBefore(current));
  ctx.nextCycle = nextCycle;

  // if we missed many cycles
  if (ctx.cyclesBilled) {
    while (nextCycle.isBefore(current)) {
      nextCycle.add(1, 'month');
    }
  }
};

function billPaidCycle(ctx, details) {
  const { params } = ctx;

  // agreement nextCycle date
  const nextCycle = moment(details.agreement.agreement_details.next_billing_date || params.nextCycle);
  const currentCycle = moment(params.nextCycle).subtract(1, 'day');
  const { transactions } = details;

  // determine how many cycles and next billing date
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

// verify transactions data
const checkData = (ctx, agreement, details) => {
  if (agreement.plan.id === FREE_PLAN_ID) {
    return billNextFreeCycle(ctx);
  }

  if (details.transactions.length === 0) {
    // no outstanding transactions
    ctx.shouldUpdate = false;
    return false;
  }

  return billPaidCycle(ctx, details);
};

const saveToRedis = async (ctx, agreement, subs) => {
  const { updateMetadata, service, audience } = ctx;
  const { amqp } = service;

  // no updates yet - skip to next
  if (ctx.shouldUpdate === false) {
    return 'OK';
  }

  const planFreq = get(agreement, 'plan.payment_definitions[0].frequency', 'month').toLowerCase();
  const sub = subs.find((x) => x.name === planFreq);
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

  await amqp.publishAndWait(updateMetadata, updateRequest, { timeout: 15000 });

  return 'OK';
};

// check agreement bill
async function agreementBill({ params }) {
  const { agreement: id, subscriptionInterval, username } = params;
  const { config, log } = this;
  const { users: { prefix, postfix } } = config;
  const start = moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD');
  const end = moment().add(1, 'day').format('YYYY-MM-DD');

  log.debug('billing %s on %s', username, id);

  const ctx = {
    service: this,

    // used params
    id,
    username,
    start,
    end,
    params,
    audience: config.users.audience,

    // pre-calculated vars
    updateMetadata: `${prefix}.${postfix.updateMetadata}`,
  };

  try {
    const agreement = await getAgreement(ctx);

    const [subs, details] = await Promise.all([
      getPlan(ctx, agreement),
      getTransactions(ctx, agreement),
    ]);

    checkData(ctx, agreement, details);

    return await saveToRedis(ctx, agreement, subs);
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
