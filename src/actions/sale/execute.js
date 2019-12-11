const { ActionTransport } = require('@microfleet/core');
const { HttpStatusError } = require('common-errors');
const Promise = require('bluebird');
const render = require('ms-mailer-templates');
const pick = require('lodash/pick');

// helpers
const key = require('../../redis-key');
const { serialize } = require('../../utils/redis');
const { SALES_DATA_PREFIX, TRANSACTION_TYPE_SALE, TRANSACTION_TYPE_3D } = require('../../constants');
const { saveCommon, parseSale, getOwner } = require('../../utils/transactions');
const { payment: { execute: executePayment }, handleError } = require('../../utils/paypal');

// parse json
function parseInput(data, fallback) {
  return data ? JSON.parse(data) : fallback;
}

// send paypal request
// eslint-disable-next-line camelcase
function sendRequest({ payer_id, payment_id }) {
  const { config } = this;
  return executePayment(payment_id, { payer_id }, config.paypal)
    .catch(handleError);
}

// save data to redis
function updateRedis(sale) {
  const { redis } = this;
  const { state } = sale;

  if (state !== 'approved') {
    throw new HttpStatusError(412, `paypal returned "${sale.state}" on the sale`);
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

  const parsedSale = parseSale(sale, owner);

  const updateTransaction = redis
    .pipeline()
    .hmget(saleKey, 'owner', 'cart')
    .hmset(saleKey, serialize(updateData))
    .exec()
    .spread((resp) => {
      const [err, recordedData] = resp;
      if (err) {
        throw err;
      }

      return {
        sale,
        username: parseInput(recordedData[0], owner),
        cart: parseInput(recordedData[1], null),
      };
    });

  const updateCommon = Promise
    .bind(this, parsedSale)
    .then(saveCommon);

  return Promise.props({
    parsedSale,
    sale: updateTransaction,
    updateCommon,
  });
}

// update user's metadata during model's sale
function updateMetadata({ sale: { sale, username, cart }, parsedSale }) {
  if (parsedSale.type !== TRANSACTION_TYPE_SALE) {
    return { sale, cart, parsedSale };
  }

  const { amqp, config } = this;
  const { users: { prefix, postfix, audience } } = config;
  const models = sale.transactions[0].item_list.items[0].quantity;
  const path = `${prefix}.${postfix.updateMetadata}`;

  const updateRequest = {
    username,
    audience,
    metadata: {
      $incr: {
        models,
      },
    },
  };

  return amqp
    .publishAndWait(path, updateRequest)
    .return({ sale, cart, parsedSale });
}

// send email
function sendCartEmail({ sale, cart, parsedSale }) {
  if (parsedSale.type !== TRANSACTION_TYPE_3D || !cart) {
    return sale;
  }

  const { mailer, config } = this;
  const cartConfig = config.cart;
  const emailData = pick(cartConfig, ['from', 'to', 'subject']);
  return render(cartConfig.template, cart)
    .then((html) => {
      const email = { ...emailData, html };
      return mailer
        .send(cartConfig.emailAccount, email)
        .return(sale);
    });
}

// Action itself
function saleExecute({ params: message }) {
  return Promise
    .bind(this, message)
    .then(sendRequest)
    .then(updateRedis)
    .then(updateMetadata)
    .then(sendCartEmail);
}

saleExecute.transports = [ActionTransport.amqp];

module.exports = saleExecute;
