const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const forEach = require('lodash/forEach');
const mapValues = require('lodash/mapValues');
const JSONStringify = JSON.stringify.bind(JSON);
const listTransactions = Promise.promisify(paypal.payment.list, { context: paypal.payment }); // eslint-disable-line
const salelist = require('./list');
const moment = require('moment');
const { PAYPAL_DATE_FORMAT, SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants.js');
const TRANSACTIONS_LIMIT = 20;
const { parseSale, saveCommon, getOwner } = require('../../utils/transactions');

function transactionSync(message = {}) {
  const { _config, redis } = this;
  const { paypal: paypalConfig } = _config;

  function updateCommon(sale, owner) {
    return Promise.bind(this, parseSale(sale, owner)).then(saveCommon);
  }

  function getLatest() {
    if (message.next_id) {
      return null;
    }

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
      count: TRANSACTIONS_LIMIT,
    };

    if (message.next_id) {
      query.start_id = message.next_id;
    } else if (items.length > 0) {
      query.start_time = moment(items[0].start_time).format(PAYPAL_DATE_FORMAT);
    }

    return listTransactions(query, paypalConfig);
  }

  function saveToRedis(data) {
    if (data.count === 0) {
      return null;
    }

    const pipeline = redis.pipeline();
    const updates = [];

    forEach(data.payments, sale => {
      const saleKey = key(SALES_DATA_PREFIX, sale.id);
      const owner = getOwner(sale);
      const saveData = {
        sale,
        owner,
        create_time: new Date(sale.create_time).getTime(),
        update_time: new Date(sale.update_time).getTime(),
      };

      pipeline.hmset(saleKey, mapValues(saveData, JSONStringify));
      pipeline.sadd(SALES_ID_INDEX, sale.id);

      updates.push(updateCommon.call(this, sale, owner));
    });

    updates.push(pipeline.exec());


    return Promise.all(updates).then(() => {
      if (data.count < TRANSACTIONS_LIMIT) {
        return null;
      }

      // recursively sync until we are done
      return transactionSync.call(this, { next_id: data.next_id });
    });
  }

  return Promise.bind(this).then(getLatest).then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
