const Errors = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');
const url = require('url');
const paypalPaymentCreate = Promise.promisify(paypal.payment.create, { context: paypal.payment });

function saleCreate(message) {
  const { _config, redis, amqp, log } = this;
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
      notify_url: _config.urls.sale_notify,
    }],
    redirect_urls: {
      return_url: _config.urls.sale_return,
      cancel_url: _config.urls.sale_cancel,
    },
  };

  function getPrice() {
    const path = _config.users.prefix + '.' + _config.users.postfix.getMetadata;
    const audience = _config.users.audience;
    const getRequest = {
      username: message.owner,
      audience,
    };

    return amqp.publishAndWait(path, getRequest, { timeout: 5000 })
      .get(audience)
      .then(metadata => {
        if (metadata.modelPrice) {
          sale.transactions[0].amount.total *= metadata.modelPrice;
          sale.transactions[0].item_list = {
            items: [{
              name: 'Model',
              price: String(metadata.modelPrice),
              quantity: String(message.amount),
              currency: 'USD',
            }],
          };
          return sale;
        }

        throw new Errors.NotSupportedError('Operation is not available on users not having agreement data.');
      });
  }

  function sendRequest(request) {
    log.info(request);
    return paypalPaymentCreate(request, _config.paypal).then(newSale => {
      const approval = ld.findWhere(newSale.links, { rel: 'approval_url' });
      if (approval === null) {
        throw new Errors.NotSupportedError('Unexpected PayPal response!');
      }
      const token = url.parse(approval.href, true).query.token;

      return {
        token,
        url: approval.href,
        sale: newSale,
      };
    });
  }

  function saveToRedis(data) {
    const saleKey = key('sales-data', data.sale.id);
    const pipeline = redis.pipeline();

    // adjust state
    sale.hidden = message.hidden;

    const saveData = {
      sale: data.sale,
      create_time: data.sale.create_time,
      update_time: data.sale.update_time,
      owner: message.owner,
    };

    pipeline.hmset(saleKey, ld.mapValues(saveData, JSON.stringify, JSON));
    pipeline.sadd('sales-index', data.sale.id);

    return pipeline.exec().return(data);
  }

  return promise.then(getPrice).then(sendRequest).then(saveToRedis);
}

module.exports = saleCreate;
