const { NotSupportedError } = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const paypalPaymentCreate = Promise.promisify(paypal.payment.create, { context: paypal.payment });
const key = require('../../redisKey.js');
const url = require('url');
const find = require('lodash/find');

const { serialize } = require('../../utils/redis.js');
const { parseSale, saveCommon } = require('../../utils/transactions');
const { SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants.js');

const PRICE_REGEXP = /(\d)(?=(\d{3})+\.)/g;

function saleCreate(message) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = _config;
  const promise = Promise.bind(this);
  const path = `${prefix}.${postfix.getMetadata}`;

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
      notify_url: _config.urls.sale_notify,
    }],
    redirect_urls: {
      return_url: _config.urls.sale_return,
      cancel_url: _config.urls.sale_cancel,
    },
  };

  function getPrice() {
    const getRequest = {
      username: message.owner,
      audience,
    };

    return amqp.publishAndWait(path, getRequest, { timeout: 5000 })
      .get(audience)
      .then(metadata => {
        if (metadata.modelPrice) {
          // paypal requires stupid formatting
          const price = metadata.modelPrice.toFixed(2).replace(PRICE_REGEXP, '$1,');
          const total = sale.transactions[0].amount.total * metadata.modelPrice;

          sale.transactions[0].amount.total = total.toFixed(2).replace(PRICE_REGEXP, '$1,');
          sale.transactions[0].item_list = {
            items: [{
              // limit of 127. Only thing that's kept during transactions sync
              name: `Client [${message.owner}]. Cappasity 3D models`.slice(0, 127),
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
    const saleKey = key(SALES_DATA_PREFIX, data.sale.id);
    const pipeline = redis.pipeline();

    // adjust state
    sale.hidden = message.hidden;

    const saveData = {
      sale: data.sale,
      create_time: new Date(data.sale.create_time).getTime(),
      update_time: new Date(data.sale.update_time).getTime(),
      owner: message.owner,
    };

    pipeline.hmset(saleKey, serialize(saveData));
    pipeline.sadd(SALES_ID_INDEX, data.sale.id);

    return pipeline.exec().return(data);
  }

  function updateCommon(data) {
    return Promise.bind(this, parseSale(data.sale, message.owner)).then(saveCommon).return(data);
  }

  return promise.then(getPrice).then(sendRequest).then(saveToRedis).then(updateCommon);
}

module.exports = saleCreate;
