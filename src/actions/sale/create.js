const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');

function saleCreate(message) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.payment.create(message.sale, _config.paypal, (error, newSale) => {
        if (error) {
          return reject(error);
        }

        const approval = ld.findWhere(newSale.links, { 'rel': 'approval_url' });
        if (approval === null) {
          return reject(new Errors.NotSupportedError('Unexpected PayPal response!'));
        }
        const token = url.parse(approval.href, true).query.token;

        resolve({ token, url: approval, sale: newSale });
      });
    });
  }

  function saveToRedis(data) {
    const { sale } = data;
    const saleKey = key('sales-data', sale.id);
    const pipeline = redis.pipeline();

    pipeline.hsetnx(saleKey, 'sale', JSON.stringify(sale));
    pipeline.hsetnx(saleKey, 'create_time', sale.create_time);
    pipeline.hsetnx(saleKey, 'update_time', sale.update_time);
    pipeline.hsetnx(saleKey, 'owner', message.owner);

    pipeline.sadd('sales-index', sale.id);

    sale.hidden = message.hidden;

    return pipeline.exec().return(data);
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = saleCreate;
