const Promise = require('bluebird');
const key = require('../../redisKey.js');
const { hmget } = require('../../listUtils.js');

const sync = require('../transaction/sync.js');
const moment = require('moment');
const Errors = require('common-errors');

const AGREEMENT_KEYS = ['agreement', 'owner', 'state'];
const PLAN_KEYS = ['plan', 'subs'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);
const planParser = hmget(PLAN_KEYS, JSON.parse, JSON);

const findIndex = require('lodash/findIndex');
const find = require('lodash/find');
const merge = require('lodash/merge');

const { PLANS_DATA } = require('../../constants.js');

function agreementBill(id) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix } } = _config;
  const start = moment().subtract(1, 'day').format('YYYY-MM-DD');
  const end = moment().format('YYYY-MM-DD');
  const promise = Promise.bind(this);

  function getAgreement() {
    const agreementKey = key('agreements-data', id);

    return redis.hmget(agreementKey, AGREEMENT_KEYS)
      .then(data => {
        const { agreement, owner, state } = agreementParser(data);
        if (state.toLowerCase() !== 'active') {
          throw new Errors.NotPermitted('Operation not permitted on non-active agreements.');
        }
        agreement.owner = owner;
        return agreement;
      });
  }

  function getPlan(agreement) {
    const planKey = key(PLANS_DATA, agreement.plan.id);

    return redis
      .hmget(planKey, PLAN_KEYS)
      .then(planParser)
      .then(({ plan, subs }) => ({
        agreement,
        plan,
        subscriptions: subs,
      }));
  }

  function getTransactions(data) {
    if (data.agreement.plan.id === 'free') {
      return Promise.resolve(data);
    }

    return sync({ id, start, end }).then(transactions => (
      merge(data, { transactions })
    ));
  }

  function checkData(data) {
    if (data.agreement.plan.id === 'free') {
      const nextCycle = moment(data.agreement.start_date);
      const current = moment();
      while (nextCycle.isBefore(current)) {
        nextCycle.add(1, 'month');
      }

      data.shouldUpdate = nextCycle.isSame(current, 'day');
      if (data.shouldUpdate) {
        data.nextUpdate = nextCycle.add(1, 'month');
      } else {
        data.lastUpdate = nextCycle;
      }
      return Promise.resolve(data);
    }

    if (data.transactions.length === 0) {
      return Promise.reject();
    }

    const nextCycle = moment(data.agreement.start_date);
    const frequency = data.agreement.plan.payment_definitions[0].frequency.toLowerCase();
    const interval = data.agreement.plan.payment_definitions[0].frequency_interval;

    const transaction = findIndex(data.transactions, t => {
      const current = moment(t.time_stamp);
      while (nextCycle.isBefore(current)) {
        nextCycle.add(interval, frequency);
      }
      return nextCycle.isSame(current, 'day');
    });

    data.shouldUpdate = transaction >= 0;
    if (data.shouldUpdate) {
      data.nextUpdate = nextCycle.add(1, frequency);
      data.transaction = transaction;
    } else {
      data.lastUpdate = nextCycle;
    }
    return Promise.resolve(data);
  }

  function saveToRedis(data) {
    const path = `${prefix}.${postfix.updateMetadata}`;
    const planFreq = data.agreement.plan.payment_definitions[0].frequency.toLowerCase();
    const sub = find(data.subs, ['name', planFreq]);
    const updateRequest = {
      username: data.agreement.owner,
      audience: _config.users.audience,
      $set: {
        modelPrice: sub.price,
        billingAmount: data.transactions[data.transaction].amount.value,
        nextCycle: data.nextUpdate.valueOf(),
      },
      $incr: {
        models: sub.models,
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
