/* global TEST_CONFIG */
const Promise = require('bluebird');
const assert = require('assert');
const Browser = require('zombie');
const { debug, duration } = require('../utils');

describe('Sales suite', function SalesSuite() {
  const browser = new Browser({ runScripts: false, waitDuration: duration });
  const Payments = require('../../src');

  // mock paypal requests
  // require('../mocks/paypal');
  const { testSaleData } = require('../data/paypal');

  const createSaleHeaders = { routingKey: 'payments.sale.create' };
  const executeSaleHeaders = { routingKey: 'payments.sale.execute' };
  const listSaleHeaders = { routingKey: 'payments.sale.list' };

  this.timeout(duration);

  let payments;

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect()
      .then(function stub() {
        payments._amqp = {
          publishAndWait: () => {
            return Promise.resolve(true);
          },
        };
      });
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create sale on invalid arguments', function() {
      return payments.router({ wrong: 'data' }, createSaleHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should create sale', function() {
      return payments.router(testSaleData, createSaleHeaders)
        .reflect()
        .then((result) => {
          assert(result.isFulfilled());
        });
    });
  });
});
