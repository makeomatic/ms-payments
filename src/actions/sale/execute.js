const Errors = require('common-errors');
const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const ld = require('lodash');
const paypalPaymentExecute = Promise.promisify(paypal.payment.execute, { context: paypal.payment });

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
      .hget(saleKey, 'owner')
      .hmset(saleKey, ld.mapValues({ sale, update_time: sale.update_time }, JSON.stringify, JSON))
      .exec()
      .spread(owner => {
        return { sale, username: owner[1] };
      });
  }

  function updateMetadata({ sale, username }) {
    const models = sale.transactions[0].item_list.items[0].quantity;
    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

    const updateRequest = {
      username,
      audience: _config.users.audience,
      $incr: {
        models,
      },
    };

    return amqp
      .publishAndWait(path, updateRequest, { timeout: 5000 })
      .return(sale);
  }

  return promise.then(sendRequest).then(updateRedis).then(updateMetadata);
}

module.exports = saleExecute;
