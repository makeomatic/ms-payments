const { ActionTransport } = require('@microfleet/core');
const moment = require('moment');
const { BillingError } = require('../../utils/paypal/agreements').error;

// helpers
const key = require('../../redis-key');
const { hmget } = require('../../list-utils');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');

// constants
const AGREEMENT_KEYS = ['agreement', 'plan', 'owner', 'state'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);

const HOOK_BILLING_SUCCESS = 'paypal:agreements:billing:success';
const HOOK_BILLING_FAILURE = 'paypal:agreements:billing:failure';

const paidAgreementPayload = (agreement, state, owner) => ({
  owner,
  id: agreement.id,
  status: state.toLowerCase(),
});
const kBannedStates = ['cancelled', 'suspended'];
const verifyAgreementState = (id, owner, state) => {
  // why could it be in uppercase anyway?
  if (!state || kBannedStates.includes(state.toLowerCase())) {
    throw BillingError.agreementStatusForbidden(id, owner, state.toLowerCase());
  }
};
const relevantTransactionsReducer = (currentCycleEnd) => (acc, it) => {
  const status = it.status && it.status.toLowerCase();
  const isRelevant = ['completed'].includes(status) && moment(it.time_stamp).isAfter(currentCycleEnd);

  return isRelevant ? acc + 1 : acc;
};

/**
 * Parses and completes agreement data retrieved from redis
 * @param  {Object} service - current microfleet
 * @param  {String} id - agreement id
 * @return {Object} agreement
 * @throws DataError When agreement data cannot be parsed
 */
async function buildAgreementData(service, id) {
  const { redis, log } = service;
  const agreementKey = key(AGREEMENT_DATA, id);
  const data = await redis.hmget(agreementKey, AGREEMENT_KEYS);

  let parsed;
  try {
    parsed = agreementParser(data);
  } catch (e) {
    log.error({
      err: e,
      keys: AGREEMENT_KEYS,
      source: String(data),
      agreementKey,
    }, 'failed to fetch agreement data');

    throw e;
  }

  // assign owner
  parsed.agreement.owner = parsed.owner;

  // FIXME: PAYPAL agreement doesn't have embedded plan id...
  // bug in paypal
  parsed.agreement.plan.id = parsed.plan;

  return parsed;
}

/**
 * Fetch transactions from PayPal for the period [start; end]
 * @param service
 * @param id Agreement ID
 * @param start
 * @param end
 * @param agreement
 * @returns {bluebird<[]>}
 */
const getActualTransactions = async (service, agreement, start, end) => {
  if (agreement.plan.id === FREE_PLAN_ID) {
    return [];
  }
  const { id } = agreement;
  const { transactions } = await service.dispatch('transaction.sync', {
    params: {
      id,
      start,
      end,
    },
  });

  return transactions;
};

async function publishHook(amqp, event, payload) {
  await amqp.publish('payments.hook.publish', { event, payload }, {
    confirm: true,
    mandatory: true,
    deliveryMode: 2,
    priority: 0,
  });
}

/**
 * @api {AMQP,internal} agreement.bill Bill agreement
 * @apiVersion 1.0.0
 * @apiName billAgreement
 * @apiGroup Agreement
 * @apiDescription Bills requested agreement
 * @apiSchema {jsonschema=agreement/bill.json} apiRequest
 * @apiSchema {jsonschema=response/agreement/bill.json} apiResponse
 */
async function agreementBill({ log, params }) {
  const { agreement: id, subscriptionInterval, username, nextCycle } = params;
  const momentCycle = moment(nextCycle);
  const start = momentCycle.clone().subtract(2, subscriptionInterval).format('YYYY-MM-DD');
  const endDate = momentCycle.clone().add(1, 'day');
  const end = endDate.format('YYYY-MM-DD');
  const { amqp } = this;

  log.debug('billing %s on %s', username, id);

  const { agreement, state } = await buildAgreementData(this, id);

  try {
    verifyAgreementState(id, username, state);
  } catch (error) {
    if (error instanceof BillingError) {
      log.warn({ err: error }, 'Agreement %s was cancelled by user %s', id, username);
      const { message, code, params: errorParams } = error;
      await publishHook(amqp, HOOK_BILLING_FAILURE, {
        error: { message, code, params: errorParams },
      });

      return 'FAIL';
    }
    // 'failed to fetch agreement data' or unexpected error
    log.warn({ err: error }, 'Failed to sync', username, id);
    throw error;
  }

  let transactions;
  try {
    transactions = await getActualTransactions(this, agreement, start, end);
    log.debug('fetched transactions for agreement %s created from %s to %s', id, start, end);
  } catch (e) {
    log.warn({ err: e }, 'Failed to sync', username, id);

    throw e;
  }
  const agreementPayload = paidAgreementPayload(agreement, state, username);

  // 1 day is too much for 'daily' interval. HOPE this doesn't break something
  const currentCycleEnd = moment(params.nextCycle).subtract(1, 'minute');
  const cyclesBilled = transactions.reduce(relevantTransactionsReducer(currentCycleEnd), 0);

  // IDK but Generally transactions should appear in 1 day after next cycle
  if (cyclesBilled !== 0 || endDate.valueOf() >= Date.now()) {
    await publishHook(amqp, HOOK_BILLING_SUCCESS, {
      agreement: agreementPayload,
      cyclesBilled,
    });
  } else {
    const error = BillingError.noRelevantTransactions(agreementPayload.id, agreementPayload.owner, { start, end });
    log.debug({ err: error }, 'No outstanding transactions');

    // If already one day passed, notify billing to enforce generic payment retry strategy
    const { message, code, params: errorParams } = error;
    await publishHook(amqp, HOOK_BILLING_FAILURE, {
      error: { message, code, params: errorParams },
    });
  }

  return 'OK';
}

agreementBill.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = agreementBill;
