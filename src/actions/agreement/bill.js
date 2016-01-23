const Promise = require('bluebird');
const key = require('../../redisKey.js');
const { hmget } = require('../../listUtils.js');

const sync = require('../transaction/sync.js');
const moment = require('moment');
const Errors = require('common-errors');

const AGREEMENT_KEYS = ['agreement', 'plan', 'owner', 'state'];
const PLAN_KEYS = ['plan', 'subs'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);
const planParser = hmget(PLAN_KEYS, JSON.parse, JSON);

const find = require('lodash/find');
const assign = require('lodash/assign');

const { PLANS_DATA, AGREEMENT_DATA } = require('../../constants.js');

// check agreement bill
function agreementBill(input) {
  const { agreement: id, subscriptionInterval } = input;
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix } } = _config;
  const start = moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD');
  const end = moment().add(1, 'day').format('YYYY-MM-DD');

  // pull agreement data
  function getAgreement() {
    const agreementKey = key(AGREEMENT_DATA, id);

    return redis
      .hmgetBuffer(agreementKey, AGREEMENT_KEYS)
      .then(data => {
        const { agreement, plan, owner, state } = agreementParser(data);
        if (state.toLowerCase() === 'cancelled') {
          throw new Errors.NotPermitted('Operation not permitted on cancelled agreements.');
        }

        agreement.owner = owner;
        // FIXME: PAYPAL agreement doesn't have embedded plan id...
        // bug in paypal
        agreement.plan.id = plan;

        return agreement;
      });
  }

  // pull plan data
  function getPlan(agreement) {
    const planKey = key(PLANS_DATA, agreement.plan.id);

    return redis
      .hmgetBuffer(planKey, PLAN_KEYS)
      .then(planParser)
      .then(({ plan, subs }) => ({ agreement, plan, subs }));
  }

  // fetch transactions from paypal
  function getTransactions(data) {
    if (data.agreement.plan.id === 'free') {
      return Promise.resolve(data);
    }

    return sync
      .call(this, { id, start, end })
      .then(agreementData => assign(data, { details: agreementData }));
  }

  // bill next free cycle
  function billNextFreeCycle(data) {
    const nextCycle = moment(input.currentCycle);
    const current = moment();

    // 0 or 1
    data.cyclesBilled = Number(nextCycle.isBefore(current));
    data.nextCycle = nextCycle;

    // if we missed many cycles
    if (data.cyclesBilled) {
      while (nextCycle.isBefore(current)) {
        nextCycle.add(1, 'month');
      }
    }

    return data;
  }

  function billPaidCycle(data) {
    // agreement nextCycle date
    const nextCycle = moment(data.details.agreement.agreement_details.next_billing_date);
    const currentCycle = moment(input.currentCycle).subtract(1, 'day');
    const { transactions } = data.details;

    // determine how many cycles and next billing date
    data.nextCycle = nextCycle;
    data.cyclesBilled = transactions.reduce((acc, it) => {
      // TODO: does paypal charge earlier?
      // we need to filter out setup fee
      if (it.status.toLowerCase() === 'сompleted' && moment(it.time_stamp).isAfter(currentCycle)) {
        acc += 1; // eslint-disable-line no-param-reassign
      }

      return acc;
    }, 0);

    return data;
  }

  // verify transactions data
  function checkData(data) {
    if (data.agreement.plan.id === 'free') {
      return billNextFreeCycle(data);
    }

    if (data.details.transactions.length === 0) {
      // no outstanding transactions
      data.shouldUpdate = false;
      return data;
    }

    return billPaidCycle(data);
  }

  function saveToRedis(data) {
    const path = `${prefix}.${postfix.updateMetadata}`;
    const planFreq = data.agreement.plan.payment_definitions[0].frequency.toLowerCase();
    const sub = find(data.subs, { name: planFreq });
    const models = sub.models * data.cyclesBilled;

    const updateRequest = {
      username: data.agreement.owner,
      audience: _config.users.audience,
      metadata: {
        $set: {
          nextCycle: data.nextCycle.valueOf(),
        },
        $incr: {
          models,
        },
      },
    };

    return amqp.publishAndWait(path, updateRequest, { timeout: 5000 }).return(data);
  }

  return Promise
    .bind(this)
    .then(getAgreement)
    .then(getPlan)
    .then(getTransactions)
    .then(checkData)
    .then(saveToRedis);
}

module.exports = agreementBill;
