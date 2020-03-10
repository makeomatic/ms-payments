const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const moment = require('moment');
const forEach = require('lodash/forEach');

// helpers
const key = require('../../redis-key');
const { PAYPAL_DATE_FORMAT, SALES_ID_INDEX, SALES_DATA_PREFIX, TRANSACTIONS_LIMIT } = require('../../constants');
const { parseSale, saveCommon, getOwner } = require('../../utils/transactions');
const { serialize } = require('../../utils/redis');
const { payment: { list: fetchPaymentList } } = require('../../utils/paypal');

function saleSync({ params: message = {} }) {
  const { config, redis } = this;
  const { paypal: paypalConfig } = config;

  function updateCommon(sale, owner) {
    return Promise.bind(this, parseSale(sale, owner)).then(saveCommon);
  }

  const getLatest = async () => {
    if (message.next_id) {
      return null;
    }

    const query = {
      order: 'DESC',
      criteria: 'create_time',
      offset: 0,
      limit: 1,
    };

    const { items } = await this.dispatch('sale.list', { params: query });

    return items;
  };

  function sendRequest(items) {
    const query = {
      count: TRANSACTIONS_LIMIT,
    };

    if (message.next_id) {
      query.start_id = message.next_id;
    } else if (items.length > 0) {
      query.start_time = moment(items[0].start_time).format(PAYPAL_DATE_FORMAT);
    }

    return fetchPaymentList(query, paypalConfig);
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
      return saleSync.call(this, { params: { next_id: data.next_id } });
    });
  }

  return Promise.bind(this).then(getLatest).then(sendRequest).then(saveToRedis);
}

saleSync.transports = [ActionTransport.amqp];

module.exports = saleSync;
