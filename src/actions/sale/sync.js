const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const map = require('lodash/map');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const listTransactions = Promise.promisify(paypal.payment.list, { context: paypal.payment }); // eslint-disable-line
const list = require('./list');
const moment = require('moment');

function transactionSync(message) {
  const { _config, redis } = this;
  const { paypal: paypalConfig } = _config;
  const promise = Promise.bind(this);

  function getLatest() {
    const query = {
      order: 'DESC',
      criteria: 'create_time',
      offset: 0,
      limit: 1,
    };

    return list(query).get('items');
  }

  function sendRequest(items) {
    const query = {
      count: 20,
    };
    if (items.length > 0) {
      query.start_time = moment(items[0].start_time).format('YYYY-MM-DD[T]HH:mm:ss[Z]');
    }
    return listTransactions(query, paypalConfig);
  }

  function saveToRedis(data) {
    const pipeline = redis.pipeline();
    const findOwner = /\[(.+?)\]/gi;

    function convertDate(strDate) {
      return moment(strDate).valueOf();
    }

    function getOwner(sale) {
      const result = findOwner.exec(sale.transactions[0].description);
      return result && result[1];
    }

    map(data, function(sale) {
      const saleKey = key('sales-data', sale.id);

      const saveData = {
        sale: sale,
        create_time: convertDate(sale.create_time),
        update_time: convertDate(sale.update_time),
        owner: getOwner(sale),
      };

      pipeline.hmset(saleKey, mapValues(saveData, JSONStringify));
      pipeline.sadd('sales-index', sale.id);
    });


    return pipeline.exec().return(data);
  }

  return promise.then(getLatest).then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
