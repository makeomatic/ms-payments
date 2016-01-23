const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const forEach = require('lodash/forEach');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const listTransactions = Promise.promisify(paypal.payment.list, { context: paypal.payment }); // eslint-disable-line
const salelist = require('./list');
const moment = require('moment');
const FIND_OWNER_REGEXP = /\[([^\]]+)\]/;
const { PAYPAL_DATE_FORMAT, SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants.js');

function getOwner(sale) {
  const result = FIND_OWNER_REGEXP.exec(sale.transactions[0].description);
  return result && result[1];
}

function transactionSync() {
  const { _config, redis } = this;
  const { paypal: paypalConfig } = _config;

  function getLatest() {
    const query = {
      order: 'DESC',
      criteria: 'create_time',
      offset: 0,
      limit: 1,
    };

    return salelist.call(this, query).get('items');
  }

  function sendRequest(items) {
    const query = {
      count: 20,
    };

    if (items.length > 0) {
      query.start_time = moment(items[0].start_time).format(PAYPAL_DATE_FORMAT);
    }

    return listTransactions(query, paypalConfig);
  }

  function saveToRedis(data) {
    const pipeline = redis.pipeline();

    function convertDate(strDate) {
      return moment(strDate).valueOf();
    }

    forEach(data, sale => {
      const saleKey = key(SALES_DATA_PREFIX, sale.id);
      const saveData = {
        sale,
        create_time: convertDate(sale.create_time),
        update_time: convertDate(sale.update_time),
        owner: getOwner(sale),
      };

      pipeline.hmset(saleKey, mapValues(saveData, JSONStringify));
      pipeline.sadd(SALES_ID_INDEX, sale.id);
    });

    return pipeline.exec().then(() => {
      if (data.length < 20) {
        return null;
      }

      // recursively sync until we are done
      return transactionSync.call(this);
    });
  }

  return Promise.bind(this).then(getLatest).then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
