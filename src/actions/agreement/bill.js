const Promise = require('bluebird');
const key = require('../../redisKey.js');
const ld = require('lodash');
const { hmget } = require('../../listUtils.js');

const sync = require('../transaction/sync.js');
const moment = require('moment');

const AGREEMENT_KEYS = ['agreement', 'owner'];
const PLAN_KEYS = ['plan', 'subs'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);
const planParser = hmget(PLAN_KEYS, JSON.parse, JSON);

function agreementBill(id) {
  const { _config, redis, amqp } = this;
  const start = moment().subtract(1, 'day').format('YYYY-MM-DD');
  const end = moment().format('YYYY-MM-DD');
  const promise = Promise.bind(this);

  function getAgreement() {
    const agreementKey = key('agreements-data', id);

    return redis.hmget(agreementKey, AGREEMENT_KEYS)
      .then(data => {
        const { agreement, owner } = agreementParser(data);
        agreement.owner = owner;
        return agreement;
      });
  }

  function getPlan(agreement) {
    const planKey = key('plans-data', agreement.plan.id);

    return redis
      .hmget(planKey, PLAN_KEYS)
      .then(planParser)
      .then(({ plan, subs }) => {
        return {
          agreement,
          plan,
          subscriptions: subs,
        };
      });
  }

  function getTransactions(data) {
    if (data.agreement.plan.id === 'free') {
      return Promise.resolve(data);
    }

    return sync({ id, start, end }).then(transactions => {
      // TODO: maybe assign is enough?
      return ld.merge(data, { transactions });
    });
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

    const transaction = ld.findIndex(data.transactions, (t) => {
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
    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;
    const sub = ld.findWhere(data.subs, { name: data.agreement.plan.payment_definitions[0].frequency.toLowerCase() });
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

  return promise.then(getAgreement).then(getPlan).then(getTransactions).then(checkData).then(saveToRedis);
}

module.exports = agreementBill;
