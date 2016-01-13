const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const Errors = require('common-errors');
const operations = ['suspend', 'reactivate', 'cancel'].reduce((ops, op) => {
  ops[op] = Promise.promisify(paypal.billingAgreement[op], { context: paypal.billingAgreement });
  return ops;
}, {});

function agreementState(message) {
  const { _config, redis, log, amqp } = this;
  const { owner, state } = message;
  const note = message.note || `Applying '${state}' operation to agreement`;

  const promise = Promise.bind(this);

  function getId() {
    const path = _config.users.prefix + '.' + _config.users.postfix.getMetadata;
    const audience = _config.users.audience;
    const getRequest = {
      username: owner,
      audience,
    };

    return amqp
      .publishAndWait(path, getRequest, { timeout: 5000 })
      .get(audience)
      .get('agreement');
  }

  function sendRequest(id) {
    if (id === 'free') {
      throw new Errors.NotPermittedError('User has free plan/agreement');
    }
    return operations[state].call(this, id, { note }, _config.paypal)
      .catch(err => {
        log.error('paypal err:', err);
        throw err;
      })
      .return(id);
  }

  function updateRedis(id) {
    const agreementKey = key('agreements-data', id);

    if (state === 'cancel') {
      // delete agreement and set user to 'free' agreement
      return redis.del(agreementKey).then(function() {
        const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

        const updateRequest = {
          username: owner,
          audience: _config.users.audience,
          metadata: {
            $set: {
              agreement: 'free',
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
