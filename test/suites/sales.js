const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const Browser = require('zombie');
const url = require('url');
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

  this.timeout(duration * 2);

  let payments;
  let sale;

  before('delay for ms-users', () => Promise.delay(2000));

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create sale on invalid arguments', function test() {
      return payments.router({ wrong: 'data' }, createSaleHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should create sale', function test() {
      return payments.router(testSaleData, createSaleHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          sale = result.value();
        });
    });

    it('Should fail to execute unapproved sale', function test() {
      return payments
        .router({ payment_id: sale.sale.id, payer_id: 'doesntmatter' }, executeSaleHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should execute approved sale', function test() {
      const cappacity = new Promise(resolve => {
        browser.on('redirect', request => {
          if (request.url.indexOf('cappasity') >= 0) {
            const parsed = url.parse(request.url, true);
            resolve({ payer_id: parsed.query.PayerID, payment_id: parsed.query.paymentId });
          }
        });
      });

      return browser
        .visit(sale.url)
        .then(() => {
          browser.assert.success();
          return browser.pressButton('#loadLogin');
        })
        .catch(err => {
          assert.equal(err.message, 'No BUTTON \'#loadLogin\'', err.message);
          return { success: true, err };
        })
        .then(() => {
          return browser
            .fill('#login_email', 'test@cappacity.com')
            .fill('#login_password', '12345678')
            .pressButton('#submitLogin');
        })
        .then(() => {
          // TypeError: unable to verify the first certificate
          return Promise.join(
            browser
              .pressButton('#continue_abovefold')
              .catch(err => {
                assert.equal(err.message, 'unable to verify the first certificate');
                return { success: true, err };
              }),
            cappacity
          )
          .then(data => data[1]);
        })
        .then((query) => {
          return payments.router(query, executeSaleHeaders)
            .reflect()
            .then(result => {
              debug(result);
              assert(result.isFulfilled());
            });
        });
    });

    it('Should list all sales', () => {
      return payments.router({}, listSaleHeaders)
        .reflect()
        .then(result => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        });
    });
  });
});
