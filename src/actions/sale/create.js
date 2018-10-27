const { NotSupportedError } = require('common-errors');
const Promise = require('bluebird');
const url = require('url');
const find = require('lodash/find');

// helpers
const key = require('../../redisKey');
const { serialize } = require('../../utils/redis');
const { parseSale, saveCommon } = require('../../utils/transactions');
const { SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants');
const { payment: { create: createPayment } } = require('../../utils/paypal');

function saleCreate({ params: message }) {
  const { config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = config;
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
      notify_url: config.urls.sale_notify,
    }],
    redirect_urls: {
      return_url: config.urls.sale_return,
      cancel_url: config.urls.sale_cancel,
    },
  };

  function getPrice() {
    const getRequest = {
      username: message.owner,
      audience,
    };

    return amqp.publishAndWait(path, getRequest, { timeout: 5000 })
      .get(audience)
      .then((metadata) => {
        if (metadata.modelPrice) {
          // paypal requires stupid formatting
          const price = metadata.modelPrice.toFixed(2);
          const total = sale.transactions[0].amount.total * metadata.modelPrice;

          sale.transactions[0].amount.total = total.toFixed(2);
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
    return createPayment(request, config.paypal).then((newSale) => {
      const approval = find(newSale.links, { rel: 'approval_url' });
      if (approval === null) {
        throw new NotSupportedError('Unexpected PayPal response!');
      }

      const { token } = url.parse(approval.href, true).query;
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
