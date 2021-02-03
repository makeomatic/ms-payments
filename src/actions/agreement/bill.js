const { ActionTransport } = require('@microfleet/core');
const moment = require('moment');
const { error: { BillingNotPermittedError } } = require('../../utils/paypal/agreements');

// helpers
const key = require('../../redis-key');
const { hmget } = require('../../list-utils');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');

// constants
const AGREEMENT_KEYS = ['agreement', 'plan', 'owner', 'state'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);
const freeAgreementPayload = (username) => ({
  id: 'free',
  owner: username,
  status: 'active',
});
const paidAgreementPayload = (agreement, state, owner) => ({
  owner,
  id: agreement.id,
  status: state.toLowerCase(),
});
const kBannedStates = ['cancelled', 'suspended'];
const verifyAgreementState = (state) => {
  if (!state || kBannedStates.includes(state.toLowerCase())) {
    throw BillingNotPermittedError.forbiddenState(state);
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
  const now = moment();
  const start = now.subtract(2, subscriptionInterval).format('YYYY-MM-DD');
  const end = now.add(1, 'day').format('YYYY-MM-DD');

  log.debug('billing %s on %s', username, id);

  if (id === FREE_PLAN_ID) {
    // @todo message builder, pass publish options
    await this.amqp.publish('payments.hook.publish', {
      event: 'paypal:agreements:billing:success',
      payload: {
        agreement: freeAgreementPayload(username),
        cyclesBilled: Number(nextCycle.isBefore(now)),
      },
    });

    return 'OK';
  }

  const { agreement, state } = await buildAgreementData(this, id);

  try {
    verifyAgreementState(state);
  } catch (error) {
    if (error instanceof BillingNotPermittedError) {
      log.warn({ err: error }, 'Agreement %s was cancelled by user %s', id, username);
      // @todo message builder, pass publish options
      await this.amqp.publish('payments.hook.publish', {
        event: 'paypal:agreements:billing:failure',
        payload: {
          error,
          agreement: paidAgreementPayload(agreement, state, username),
        },
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

  if (agreement.plan.id === FREE_PLAN_ID || transactions.length !== 0) {
    const currentCycleEnd = moment(params.nextCycle).subtract(1, 'day');
    // @todo message builder, pass publish options
    await this.amqp.publish('payments.hook.publish', {
      event: 'paypal:agreements:billing:success',
      payload: {
        agreement: paidAgreementPayload(agreement, state, username),
        cyclesBilled: transactions.reduce(relevantTransactionsReducer(currentCycleEnd), 0),
      },
    });
  }

  return 'OK';
}

agreementBill.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = agreementBill;
