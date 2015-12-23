const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey');
const ld = require('lodash');

function saleExecute(message) {
  const { _config, redis, amqp } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    return new Promise((resolve, reject) => {
      paypal.payment.execute(message.payment_id, {payer_id: message.payer_id}, _config.paypal, (error, info) => {
        if (error) {
          return reject(error);
        }

        resolve(info);
      });
    });
  }

  function updateRedis(sale) {
    const saleKey = key('sales-data', sale.id);

    return redis
      .hmset(saleKey, ld.mapValues({sale, update_time: sale.update_time}, JSON.stringify, JSON))
      .return(sale);
  }

  function getMetadata(sale) {
    const path = _config.users.prefix + '.' + _config.users.postfix.getMetadata;
    const getRequest = {
      username: message.owner,
      audience: _config.users.audience,
    };
    return amqp.publishAndWait(path, getRequest, {timeout: 5000})
      .then((metadata) => {
        const oldModels = metadata.models || 0;
        return { sale, oldModels };
      });
  }

  function updateMetadata(data) {
    const { sale, oldModels } = data;
    const models = sale.transactions[0].item_list.items[0].quantity + oldModels;
    const path = _config.users.prefix + '.' + _config.users.postfix.updateMetadata;

    const updateRequest = {
      'username': message.owner,
      'audience': _config.users.audience,
      '$set': {models},
    };

    return amqp
      .publishAndWait(path, updateRequest, {timeout: 5000})
      .return(sale);
  }

  return promise.then(sendRequest).then(updateRedis).then(getMetadata).then(updateMetadata);
}

module.exports = saleExecute;
