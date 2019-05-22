const Promise = require('bluebird');
const Errors = require('common-errors');
const moment = require('moment');
const { ActionTransport } = require('@microfleet/core');

// internal actions
const syncTransactions = require('../transaction/sync');

// helpers
const key = require('../../redis-key');
const { agreement: operations } = require('../../utils/paypal');
const resetToFreePlan = require('../../utils/reset-to-free-plan');
const { serialize } = require('../../utils/redis');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');

// correctly save state
const ACTION_TO_STATE = {
  suspend: 'suspended',
  reactivate: 'active',
  cancel: 'cancelled',
};

function agreementState({ params: message }) {
  const { config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = config;
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
    const { agreement: id, subscriptionInterval, subscriptionType } = meta;

    if (id === FREE_PLAN_ID) {
      throw new Errors.NotPermittedError('User has free plan/agreement');
    }

    if (subscriptionType === 'capp') {
      throw new Errors.NotPermittedError('Must use capp payments service');
    }

    return operations[state]
      .call(this, id, { note }, config.paypal)
      .catch((err) => {
        throw new Errors.HttpStatusError(err.httpStatusCode, `${id}: ${err.response.message}`, err.response.name);
      })
      .tap(() => syncTransactions.call(this, {
        params: {
          id,
          owner,
          start: moment().subtract(2, subscriptionInterval).format('YYYY-MM-DD'),
          end: moment().add(1, 'day').format('YYYY-MM-DD'),
        },
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

agreementState.transports = [ActionTransport.amqp];

module.exports = agreementState;
