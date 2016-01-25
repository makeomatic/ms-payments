const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const Errors = require('common-errors');
const moment = require('moment');
const syncTransactions = require('../transaction/sync.js');
const operations = ['suspend', 'reactivate', 'cancel'].reduce((ops, op) => {
  ops[op] = Promise.promisify(paypal.billingAgreement[op], { context: paypal.billingAgreement });
  return ops;
}, {});

function agreementState(message) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = _config;
  const { owner, state } = message;
  const note = message.note || `Applying '${state}' operation to agreement`;

  const promise = Promise.bind(this);

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
    const agreementKey = key('agreements-data', id);

    if (state === 'cancel') {
      // delete agreement and set user to 'free' agreement
      return redis.del(agreementKey).then(() => {
        const path = `${prefix}.${postfix.updateMetadata}`;

        const updateRequest = {
          username: owner,
          audience,
          metadata: {
            $set: {
              agreement: 'free',
              subscriptionPrice: '0.00',
              subscriptionInterval: 'month',
            },
          },
        };

        return amqp.publishAndWait(path, updateRequest, { timeout: 5000 });
      }).return(state);
    }

    return redis
      .hset(agreementKey, 'state', JSON.stringify(state))
      .return(state);
  }

  return promise.then(getId).then(sendRequest).then(updateRedis);
}

module.exports = agreementState;
