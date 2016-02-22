const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const nightmare = require('../browser');
const url = require('url');
const { debug, duration } = require('../utils');

describe('Sales suite', function SalesSuite() {
  const Payments = require('../../src');

  // mock paypal requests
  // require('../mocks/paypal');
  const { testSaleData, testDynamicSaleData } = require('../data/paypal');

  const createSaleHeaders = { routingKey: 'payments.sale.create' };
  const createDynamicSaleHeaders = { routingKey: 'payments.sale.createDynamic' };
  const executeSaleHeaders = { routingKey: 'payments.sale.execute' };
  const listSaleHeaders = { routingKey: 'payments.sale.list' };

  this.timeout(duration * 4);

  let payments;
  let sale;

  function approve(saleUrl) {
    const browser = nightmare({
      show: true,
      waitTimeout: duration * 2,
    });

    return new Promise(function(resolve) {
      browser
        .on('did-get-response-details', function(event, status, newUrl) {
          if (newUrl.indexOf('cappasity') >= 0) {
            const parsed = url.parse(newUrl, true);
            resolve({payer_id: parsed.query.PayerID, payment_id: parsed.query.paymentId});
          }
        })
        .goto(saleUrl)
        .ewait('dom-ready')
        .evaluate(function() {
          document.querySelector('#email').value = 'test@cappacity.com';
          document.querySelector('#password').value = '12345678';
          document.querySelector('input[type=submit]').click();
        })
        .wait(function() {
          function isHidden(el) {
            const style = window.getComputedStyle(el);
            return (style.display === 'none');
          }
          return !isHidden(document.querySelector('#confirmButtonTop'));
        })
        .evaluate(function() {
          document.querySelector('#confirmButtonTop').click();
        })
        .wait(3000)
        .end();
    }).bind(browser);
  }

  before(() => {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create sale on invalid arguments', () => {
      return payments.router({ wrong: 'data' }, createSaleHeaders)
        .reflect()
        .then(result => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should create sale', () => {
      return payments.router(testSaleData, createSaleHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          sale = result.value();
        });
    });

    it('Should fail to execute unapproved sale', () => {
      return payments
        .router({ payment_id: sale.sale.id, payer_id: 'doesntmatter' }, executeSaleHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should execute approved sale', () => {
      return approve(sale.url)
        .tap()
        .then(query => {
          return payments.router(query, executeSaleHeaders)
            .reflect()
            .then(result => {
              debug(result);
              assert(result.isFulfilled());
            });
        });
    });

    it('Should create 3d printing sale', () => {
      return payments.router(testDynamicSaleData, createDynamicSaleHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          sale = result.value();
        });
    });

    it('Should approve & execute 3d printing sale', () => {
      return approve(sale.url)
        .then(query => (
          payments.router(query, executeSaleHeaders)
            .reflect()
            .then(result => {
              debug(result);
              assert(result.isFulfilled());
            })
        ));
    });

    it('Should list all sales', () => (
      payments.router({}, listSaleHeaders)
        .reflect()
        .then(result => (
          result.isFulfilled() ? result.value() : Promise.reject(result.reason())
        ))
    ));
  });
});
