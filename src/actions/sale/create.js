const Errors = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');
const url = require('url');

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

    // adjust state
    sale.hidden = message.hidden;

    const saveData = {
      sale,
      create_time: sale.create_time,
      update_time: sale.update_time,
      owner: message.owner,
    };

    pipeline.hmset(saleKey, ld.mapValues(saveData, JSON.stringify, JSON));
    pipeline.sadd('sales-index', sale.id);

    return pipeline.exec().return(data);
  }

  return promise.then(sendRequest).then(saveToRedis);
}

module.exports = saleCreate;
