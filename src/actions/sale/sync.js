const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const moment = require('moment');
const forEach = require('lodash/forEach');

// internal actions
const salelist = require('./list');

// helpers
const key = require('../../redisKey.js');
const { PAYPAL_DATE_FORMAT, SALES_ID_INDEX, SALES_DATA_PREFIX } = require('../../constants.js');
const { parseSale, saveCommon, getOwner } = require('../../utils/transactions');
const { serialize } = require('../../utils/redis.js');

// eslint-disable-next-line max-len
const listTransactions = Promise.promisify(paypal.payment.list, { context: paypal.payment });
const TRANSACTIONS_LIMIT = 20;

function transactionSync({ params: message = {} }) {
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

    return salelist.call(this, { params: query }).get('items');
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

    forEach(data.payments, (sale) => {
      const saleKey = key(SALES_DATA_PREFIX, sale.id);
      const owner = getOwner(sale);
      const saveData = {
        sale,
        owner,
        create_time: new Date(sale.create_time).getTime(),
        update_time: new Date(sale.update_time).getTime(),
      };

      pipeline.hmset(saleKey, serialize(saveData));
      pipeline.sadd(SALES_ID_INDEX, sale.id);

      updates.push(updateCommon.call(this, sale, owner));
    });

    updates.push(pipeline.exec());

    return Promise.all(updates).then(() => {
      if (data.count < TRANSACTIONS_LIMIT) {
        return null;
      }

      // recursively sync until we are done
      return transactionSync.call(this, { params: { next_id: data.next_id } });
    });
  }

  return Promise.bind(this).then(getLatest).then(sendRequest).then(saveToRedis);
}

module.exports = transactionSync;
