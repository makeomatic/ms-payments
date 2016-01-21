const Errors = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const paypalPaymentExecute = Promise.promisify(paypal.payment.execute, { context: paypal.payment });
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);

function saleExecute(message) {
  const { _config, redis, amqp } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return paypalPaymentExecute(message.payment_id, { payer_id: message.payer_id }, _config.paypal);
  }

  function updateRedis(sale) {
    if (sale.state !== 'approved') {
      throw new Errors.HttpStatusError(412, `paypal returned "${sale.state}" on the sale`);
    }

    const saleKey = key('sales-data', sale.id);

    return redis
      .pipeline()
      .hgetBuffer(saleKey, 'owner')
      .hmset(saleKey, mapValues({ sale, update_time: sale.update_time }, JSONStringify))
      .exec()
      .spread(owner => {
        return { sale, username: JSON.parse(owner[1]) };
      });
  }

  function updateMetadata({ sale, username }) {
    const models = sale.transactions[0].item_list.items[0].quantity;
    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

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

  return promise.then(sendRequest).then(updateRedis).then(updateMetadata);
}

module.exports = saleExecute;
