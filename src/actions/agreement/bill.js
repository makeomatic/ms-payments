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

const { PLANS_DATA } = require('../../constants.js');

// check agreement bill
function agreementBill(id) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = _config;
  const start = moment().subtract(1, 'day').format('YYYY-MM-DD');
  const end = moment().format('YYYY-MM-DD');
  const promise = Promise.bind(this);

  // pull agreement data
  function getAgreement() {
    const agreementKey = key('agreements-data', id);

    return redis
      .hmgetBuffer(agreementKey, AGREEMENT_KEYS)
      .then(data => {
        const { agreement, plan, owner, state } = agreementParser(data);
        if (state.toLowerCase() !== 'active') {
          throw new Errors.NotPermitted('Operation not permitted on non-active agreements.');
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
    const path = `${prefix}.${postfix.getMetadata}`;
    const message = { username: data.agreement.owner, audience };

    return amqp
      .publishAndWait(path, message, { timeout: 5000 })
      .get(audience)
      .then(metadata => {
        const nextCycle = moment(metadata.nextCycle);
        const current = moment();

        data.shouldUpdate = nextCycle.isBefore(current);
        data.nextCycle = nextCycle;

        // if we missed many cycles
        if (data.shouldUpdate) {
          while (nextCycle.isBefore(current)) {
            nextCycle.add(1, 'month');
          }
        }

        return data;
      });
  }

  function billPaidCycle(data) {
    // agreement nextCycle date
    const nextCycle = moment(data.details.agreement.agreement_details.next_billing_date);
    const { transactions } = data.details;

    // determine how many cycles and next billing date
    data.nextCycle = nextCycle;
    data.shouldUpdate = transactions.reduce((acc, it) => {
      if (it.status === 'Completed') {
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
    if (!data.shouldUpdate) {
      return data;
    }

    const path = `${prefix}.${postfix.updateMetadata}`;
    const planFreq = data.agreement.plan.payment_definitions[0].frequency.toLowerCase();
    const sub = find(data.subs, { name: planFreq });
    const models = sub.models * data.shouldUpdate;

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

  return promise
    .then(getAgreement)
    .then(getPlan)
    .then(getTransactions)
    .then(checkData)
    .then(saveToRedis);
}

module.exports = agreementBill;
