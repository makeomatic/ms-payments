const Errors = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const paypalPaymentExecute = Promise.promisify(paypal.payment.execute, { context: paypal.payment });
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);

function saleExecute(message) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix } } = _config;

  function sendRequest() {
    return paypalPaymentExecute(message.payment_id, { payer_id: message.payer_id }, _config.paypal)
      .catch(err => {
        this.log.warn('failed to bill payment', err.response);
        throw new Errors.HttpStatusError(err.httpStatusCode, err.response.message, err.response.name);
      });
  }

  function updateRedis(sale) {
    if (sale.state !== 'approved') {
      throw new Errors.HttpStatusError(412, `paypal returned "${sale.state}" on the sale`);
    }

    const saleKey = key('sales-data', sale.id);
    const payer = sale.payer.payer_info.email && sale.payer.payer_info.email;
    const updateData = {
      sale,
      update_time: sale.update_time,
    };

    if (payer) {
      updateData.payer = payer;
    }

    return redis
      .pipeline()
      .hgetBuffer(saleKey, 'owner')
      .hmset(saleKey, mapValues(updateData, JSONStringify))
      .exec()
      .spread(owner => ({
        sale,
        username: JSON.parse(owner[1]),
      }));
  }

  function updateMetadata({ sale, username }) {
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
      .return(sale);
  }

  return Promise.bind(this).then(sendRequest).then(updateRedis).then(updateMetadata);
}

module.exports = saleExecute;
