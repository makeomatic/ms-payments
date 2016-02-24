const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const Nightmare = require('nightmare');
const url = require('url');
const once = require('lodash/once');
const { debug, duration } = require('../utils');

describe('Sales suite', function SalesSuite() {
  const Payments = require('../../src');

  const { testSaleData, testDynamicSaleData } = require('../data/paypal');
  const createSaleHeaders = { routingKey: 'payments.sale.create' };
  const createDynamicSaleHeaders = { routingKey: 'payments.sale.createDynamic' };
  const executeSaleHeaders = { routingKey: 'payments.sale.execute' };
  const listSaleHeaders = { routingKey: 'payments.sale.list' };

  this.timeout(duration * 4);

  let payments;
  let sale;

  function approve(saleUrl) {
    const browser = new Nightmare({
      waitTimeout: 15000,
    });

    return new Promise(_resolve => {
      const resolve = once(_resolve);

      browser
        .on('did-get-redirect-request', (events, oldUrl, newUrl) => {
          if (newUrl.indexOf('cappasity') >= 0) {
            const parsed = url.parse(newUrl, true);
            resolve({ payer_id: parsed.query.PayerID, payment_id: parsed.query.paymentId });
          }
        })
        .on('did-get-response-details', (event, status, newUrl) => {
          if (newUrl.indexOf('cappasity') >= 0) {
            const parsed = url.parse(newUrl, true);
            resolve({ payer_id: parsed.query.PayerID, payment_id: parsed.query.paymentId });
          }
        })
        .goto(saleUrl)
        .screenshot('./ss/pre-email.png')
        .wait('#email')
        .type('#email', false)
        .wait(3000)
        .type('#email', 'test@cappacity.com')
        .type('#password', '12345678')
        .wait(3000)
        .screenshot('./ss/after-email.png')
        .click('input[type=submit]')
        .wait(10000)
        .screenshot('./ss/after-submit.png')
        .wait('#confirmButtonTop')
        .screenshot('./ss/pre-confirm.png')
        .click('#confirmButtonTop')
        .wait(3000)
        .screenshot('./ss/after-confirm.png')
        .end()
        .then(() => {
          console.log('completed running %s', saleUrl); // eslint-disable-line
        });
    });
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
        .then(result => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        })
    ));
  });
});
