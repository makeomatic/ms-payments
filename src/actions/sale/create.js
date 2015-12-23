const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');
const url = require('url');
const Errors = require('common-errors');

function saleCreate(message) {
  const { _config, redis, amqp } = this;
  const promise = Promise.bind(this);

  // convert request to sale object
  const sale = {
    intent: 'sale',
    payer: {
      payment_method: 'paypal',
    },
    transactions: [{
      amount: {
        total: message.amount,
        currency: 'USD',
      },
      description: `Buy ${message.amount} models`,
    }],
    redirect_urls: {
      return_url: message.return_url,
      cancel_url: message.cancel_url,
    },
  };

  function getPrice() {
    const path = _config.users.prefix + '.' + _config.users.postfix.getMetadata;
    const getRequest = {
      username: message.owner,
      audience: _config.users.audience,
    };
    return amqp.publishAndWait(path, getRequest, {timeout: 5000})
      .then((metadata) => {
        if (metadata.modelPrice) {
          sale.transactions[0].amount.total *= metadata.modelPrice;
          return sale;
        }
        return new Errors.NotSupportedError('Operation is not available on users not having agreement data.');
      });
  }

  function sendRequest(request) {
    return new Promise((resolve, reject) => {
      paypal.payment.create(request, _config.paypal, (error, newSale) => {
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
    const saleKey = key('sales-data', data.sale.id);
    const pipeline = redis.pipeline();

    pipeline.hset(saleKey, 'sale', JSON.stringify(data.sale));
    pipeline.hset(saleKey, 'create_time', data.sale.create_time);
    pipeline.hset(saleKey, 'update_time', data.sale.update_time);
    pipeline.hset(saleKey, 'owner', message.owner);

    pipeline.sadd('sales-index', data.sale.id);
    return pipeline.exec().return(data);
  }

  return promise.then(getPrice).then(sendRequest).then(saveToRedis);
}

module.exports = saleCreate;
