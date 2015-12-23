const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');

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
    const pipeline = redis.pipeline();

    pipeline.hset(saleKey, 'sale', JSON.stringify(sale));
    pipeline.hset(saleKey, 'update_time', sale.update_time);

    return pipeline.exec().return(sale);
  }

  return promise.then(sendRequest).then(updateRedis);
}

module.exports = saleExecute;
