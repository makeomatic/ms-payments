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

function saleCreate(message) {
  const { _config, redis } = this;
  const { users: { prefix, postfix } } = _config;
  const promise = Promise.bind(this);

  // convert request to sale object
  const sale = {
    intent: 'sale',
    payer: {
      payment_method: 'paypal',
    },
    transactions: [{
      amount: {
        total: message.amount.toFixed(2),
        currency: 'USD',
      },
      item_list: {
        items: [{
          name: `Client [${message.owner}]. 3d printing service`.slice(0, 127),
          price: message.amount.toFixed(2),
          quantity: 1,
          currency: 'USD',
        }],
      },
      notify_url: _config.urls.sale_notify,
    }],
    redirect_urls: {
      return_url: _config.urls.sale_return,
      cancel_url: _config.urls.sale_cancel,
    },
  };

  function sendRequest() {
    console.log(require('util').inspect(sale, {depth:5}))
    return paypalPaymentCreate(sale, _config.paypal).then(newSale => {
      const approval = find(newSale.links, { rel: 'approval_url' });
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

  return promise.then(sendRequest).then(saveToRedis).then(updateCommon);
}

module.exports = saleCreate;
