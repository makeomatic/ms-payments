const Promise = require('bluebird');
const key = require('../../redisKey.js');
const ld = require('lodash');

const sync = require('./../transaction/sync');
const moment = require('moment');

function agreementBill(id) {
  const { _config, redis, amqp } = this;
  const start = moment().subtract(1, 'day').format('YYYY-MM-DD');
  const end = moment().format('YYYY-MM-DD');
  const promise = Promise.bind(this);

  function getAgreement() {
    const agreementKey = key('agreements-data', id);
    const pipeline = redis.pipeline();

    pipeline.hget(agreementKey, 'agreement');
    pipeline.hget(agreementKey, 'owner');

    return pipeline.exec().then((result) => {
      const agreement = JSON.parse(result[0]);
      agreement.owner = result[1];
      return agreement;
    });
  }

  function getPlan(agreement) {
    const planKey = key('plans-data', agreement.plan.id);
    const pipeline = redis.pipeline();

    pipeline.hget(planKey, 'plan');
    pipeline.hget(planKey, 'subs');

    return pipeline.exec().then((result) => {
      const plan = JSON.parse(result[0]);
      const subs = JSON.parse(result[1]);

      return {
        agreement: agreement,
        plan: plan,
        subscriptions: subs,
      };
    });
  }

  function getTransactions(data) {
    if (data.agreement.plan.id === 'free') {
      return Promise.resolve(data);
    }
    return sync({ id, start, end }).then(transactions => {
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
    const sub = ld.findWhere(data.subs, { id: data.agreement.plan.payment_definitions[0].name });
    const updateRequest = {
      'username': data.agreement.owner,
      'audience': _config.billing.audience,
      '$set': {
        'models': sub.models,
        'model_price': sub.price,
        'billing_amount': data.transactions[data.transaction].amount.value,
        'next_billing': data.nextUpdate,
      },
    };

    return amqp
      .publishAndWait(_config.users.prefix + '.' + _config.users.postfix.updateMetadata, updateRequest, { timeout: 5000 })
      .return(data);
  }

  return promise.then(getAgreement).then(getPlan).then(getTransactions).then(checkData).then(saveToRedis);
}

module.exports = agreementBill;
