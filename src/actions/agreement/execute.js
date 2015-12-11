const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');

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
    const pipeline = redis.pipeline;

    pipeline.hsetnx(agreementKey, 'agreement', JSON.stringify(agreement));
    pipeline.hsetnx(agreementKey, 'state', agreement.state);
    pipeline.hsetnx(agreementKey, 'name', agreement.name);

    return pipeline.exec().then(() => {
      return agreement;
    });
  }

  return promise.then(sendRequest).then(fetchUpdatedAgreement).then(updateRedis);
}

module.exports = agreementExecute;
