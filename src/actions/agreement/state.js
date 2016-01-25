const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const Errors = require('common-errors');
const moment = require('moment');
const operations = ['suspend', 'reactivate', 'cancel'].reduce((ops, op) => {
  ops[op] = Promise.promisify(paypal.billingAgreement[op], { context: paypal.billingAgreement });
  return ops;
}, {});

const { serialize } = require('../../utils/redis.js');
const key = require('../../redisKey.js');
const { AGREEMENT_DATA } = require('../../constants.js');
const syncTransactions = require('../transaction/sync.js');

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

    if (id === 'free') {
      throw new Errors.NotPermittedError('User has free plan/agreement');
    }

    return operations[state]
      .call(this, id, { note }, _config.paypal)
      .catch(err => {
        throw new Errors.HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
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
    const promises = [redis.hmset(agreementKey, serialize({ state }))];

    if (state === 'cancel') {
      // delete agreement and set user to 'free' agreement
      const path = `${prefix}.${postfix.updateMetadata}`;
      const updateRequest = {
        username: owner,
        audience,
        metadata: {
          $set: {
            agreement: 'free',
            plan: 'free',
            subscriptionPrice: '0.00',
            subscriptionInterval: 'month',
            modelPrice: find(_config.defaultPlans, { id: 'free' }).subscriptions[0].price,
          },
        },
      };

      promises.push(amqp.publishAndWait(path, updateRequest, { timeout: 5000 }));
    }

    return Promise.all(promises).return(state);
  }

  return Promise.bind(this).then(getId).then(sendRequest).then(updateRedis);
}

module.exports = agreementState;
