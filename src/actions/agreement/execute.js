const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const ld = require('lodash');

function agreementExecute(token) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.execute(token, {}, _config.paypal, (error, info) => {
        if (error) {
          return reject(error);
        }

        resolve(info.id);
      });
    });
  }

  function fetchUpdatedAgreement(id) {
    return new Promise((resolve, reject) => {
      paypal.billingAgreement.get(id, _config.paypal, (error, agreement) => {
        if (error) {
          return reject(error);
        }

        resolve(agreement);
      });
    });
  }

  function updateRedis(agreement) {
    const agreementKey = key('agreements-data', agreement.id);

    const data = ld.mapValues({
      agreement,
      state: agreement.state,
      name: agreement.name,
    }, JSON.stringify, JSON);

    return redis.hmset(agreementKey, data).return(agreement);
  }

  return promise.then(sendRequest).then(fetchUpdatedAgreement).then(updateRedis);
}

module.exports = agreementExecute;
