const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const operations = ['suspend', 'reactivate', 'cancel'].reduce((ops, op) => {
  ops[op] = Promise.promisify(paypal.billingAgreement[op], { context: paypal.billingAgreement });
  return ops;
}, {});

function planState(message) {
  const { _config, redis } = this;
  const { id, state } = message;
  const note = message.note || `Applying '${state}' operation to agreement`;

  const promise = Promise.bind(this);

  function sendRequest() {
    return operations[state].call(this, id, { note });
  }

  function updateRedis() {
    const agreementKey = key('agreements-data', id);

    return redis
      .hset(agreementKey, 'state', JSON.stringify(state))
      .return(state);
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = planState;
