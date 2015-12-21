const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const ld = require('lodash');

function saleExecute(message) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.payment.execute(message.token, { payer_id: message.payer_id }, _config.paypal, (error, info) => {
        if (error) {
          return reject(error);
        }

        resolve(info);
      });
    });
  }

  function updateRedis(sale) {
    const saleKey = key('sales-data', sale.id);

    return redis
      .hmset(saleKey, ld.mapValues({ sale, update_time: sale.update_time }, JSON.stringify, JSON))
      .return(sale);
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = saleExecute;
