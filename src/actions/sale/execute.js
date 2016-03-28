const Errors = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const paypalPaymentExecute = Promise.promisify(paypal.payment.execute, { context: paypal.payment });

const { serialize } = require('../../utils/redis.js');
const { SALES_DATA_PREFIX } = require('../../constants.js');
const { saveCommon, parseSale, getOwner } = require('../../utils/transactions.js');

const render = require('ms-mailer-templates');

function saleExecute(message) {
  const { _config, redis, amqp, mailer } = this;
  const { users: { prefix, postfix } } = _config;

  function sendRequest() {
    return paypalPaymentExecute(message.payment_id, { payer_id: message.payer_id }, _config.paypal)
      .catch(err => {
        this.log.warn('failed to bill payment', err.response);
        throw new Errors.HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
      });
  }

  function updateRedis(sale) {
    const { state } = sale;
    if (state !== 'approved') {
      throw new Errors.HttpStatusError(412, `paypal returned "${sale.state}" on the sale`);
    }

    const { id } = sale;
    const saleKey = key(SALES_DATA_PREFIX, id);
    const payer = sale.payer.payer_info.email && sale.payer.payer_info.email;
    const owner = getOwner(sale);

    const updateData = {
      sale,
      create_time: new Date(sale.create_time).getTime(),
      update_time: new Date(sale.update_time).getTime(),
    };

    if (payer) {
      updateData.payer = payer;
    }

    if (owner) {
      updateData.owner = owner;
    }

    const updateTransaction = redis
      .pipeline()
      .hgetBuffer(saleKey, 'owner')
      .hgetBuffer(saleKey, 'cart')
      .hmset(saleKey, serialize(updateData))
      .exec()
      .spread((recordedOwner, recordedCart) => ({
        sale,
        username: recordedOwner[1] && JSON.parse(recordedOwner[1]) || owner,
        cart: recordedCart[1] && JSON.parse(recordedCart[1]) || null,
      }));

    const updateCommon = Promise.bind(this, parseSale(sale, owner)).then(saveCommon);

    return Promise.join(updateTransaction, updateCommon).get(0);
  }

  function updateMetadata({ sale, username, cart }) {
    const models = sale.transactions[0].item_list.items[0].quantity;
    const path = `${prefix}.${postfix.updateMetadata}`;

    const updateRequest = {
      username,
      audience: _config.users.audience,
      metadata: {
        $incr: {
          models,
        },
      },
    };

    return amqp
      .publishAndWait(path, updateRequest, { timeout: 5000 })
      .return({ sale, cart });
  }

  function sendCartEmail({ sale, cart }) {
    if (cart === null) {
      return Promise.resolve(sale);
    }

    // TODO: maybe add plain text template too?
    return render(_config.cart.template, cart).then(html => {
      const email = {
        from: _config.cart.from,
        to: _config.cart.to,
        subject: _config.cart.subject,
        html,
      };

      return mailer.send(_config.cart.emailAccount, email).return(sale);
    });
  }

  return Promise.bind(this).then(sendRequest).then(updateRedis).then(updateMetadata).then(sendCartEmail);
}

module.exports = saleExecute;
