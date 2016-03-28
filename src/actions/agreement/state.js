const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const Errors = require('common-errors');
const moment = require('moment');

// paypal
const operations = ['suspend', 'reactivate', 'cancel'].reduce((ops, op) => {
  ops[op] = Promise.promisify(paypal.billingAgreement[op], { context: paypal.billingAgreement });
  return ops;
}, {});

// user-defined
const key = require('../../redisKey.js');
const resetToFreePlan = require('../../utils/resetToFreePlan.js');
const syncTransactions = require('../transaction/sync.js');
const { serialize } = require('../../utils/redis.js');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants.js');

// correctly save state
const ACTION_TO_STATE = {
  suspend: 'suspended',
  reactivate: 'active',
  cancel: 'cancelled',
};

function agreementState(message) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = _config;
  const { owner, state } = message;
  const note = message.note || `Applying '${state}' operation to agreement`;

  function getId() {
    const path = `${prefix}.${postfix.getMetadata}`;
    const getRequest = {
      username: owner,
      audience,
    };

    return amqp
      .publishAndWait(path, getRequest, { timeout: 5000 })
      .get(audience);
  }

  function sendRequest(meta) {
    const { agreement: id, subscriptionInterval } = meta;

    if (id === FREE_PLAN_ID) {
      throw new Errors.NotPermittedError('User has free plan/agreement');
    }

    return operations[state]
      .call(this, id, { note }, _config.paypal)
      .catch(err => {
        throw new Errors.HttpStatusError(err.httpStatusCode, `${id}: ${err.response.message}`, err.response.name);
      })
      .tap(() => syncTransactions.call(this, {
        id,
        owner,
        start: moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD'),
        end: moment().add(1, 'day').format('YYYY-MM-DD'),
      }))
      .return(id);
  }

  function updateRedis(id) {
    const agreementKey = key(AGREEMENT_DATA, id);
    const promises = [redis.hmset(agreementKey, serialize({ state: ACTION_TO_STATE[state] }))];

    if (state === 'cancel') {
      promises.push(resetToFreePlan.call(this, owner));
    }

    return Promise.all(promises).return(state);
  }

  return Promise
    .bind(this)
    .then(getId)
    .then(sendRequest)
    .then(updateRedis);
}

module.exports = agreementState;
