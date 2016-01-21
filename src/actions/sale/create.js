const { NotSupportedError } = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const url = require('url');
const paypalPaymentCreate = Promise.promisify(paypal.payment.create, { context: paypal.payment });
const PRICE_REGEXP = /(\d)(?=(\d{3})+\.)/g;

const find = require('lodash/find');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);

const moment = require('moment');

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
      description: `Buy ${message.amount} models for [${message.owner}]`,
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
      .then(function buildMetadata(metadata) {
        if (metadata.modelPrice) {
          // paypal requires stupid formatting
          const price = metadata.modelPrice.toFixed(2).replace(PRICE_REGEXP, '$1,');
          const total = sale.transactions[0].amount.total * metadata.modelPrice;

          sale.transactions[0].amount.total = total.toFixed(2).replace(PRICE_REGEXP, '$1,');
          sale.transactions[0].item_list = {
            items: [{
              name: 'Model',
              price,
              quantity: message.amount,
              currency: 'USD',
            }],
          };
          return sale;
        }

        throw new NotSupportedError('Operation is not available on users not having agreement data.'); // eslint-disable-line
      });
  }

  function sendRequest(request) {
    return paypalPaymentCreate(request, _config.paypal).then(newSale => {
      const approval = find(newSale.links, ['rel', 'approval_url']);
      if (approval === null) {
        throw new NotSupportedError('Unexpected PayPal response!');
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

    function convertDate(strDate) {
      return moment(strDate).valueOf();
    }

    const saveData = {
      sale: data.sale,
      create_time: convertDate(data.sale.create_time),
      update_time: convertDate(data.sale.update_time),
      owner: message.owner,
    };

    pipeline.hmset(saleKey, mapValues(saveData, JSONStringify));
    pipeline.sadd('sales-index', data.sale.id);

    return pipeline.exec().return(data);
  }

  return promise.then(getPrice).then(sendRequest).then(saveToRedis);
}

module.exports = saleCreate;
