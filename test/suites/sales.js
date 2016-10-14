const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const Nightmare = require('nightmare');
const url = require('url');
const once = require('lodash/once');
const sinon = require('sinon');
const { debug, duration, simpleDispatcher } = require('../utils');

describe('Sales suite', function SalesSuite() {
  const Payments = require('../../src');

  const { testSaleData, testDynamicSaleData } = require('../data/paypal');
  const createSale = 'payments.sale.create';
  const createDynamicSale = 'payments.sale.createDynamic';
  const executeSale = 'payments.sale.execute';
  const listSale = 'payments.sale.list';

  this.timeout(duration * 4);

  let payments;
  let sale;
  let dispatch;

  function approve(saleUrl) {
    const browser = new Nightmare({
      waitTimeout: 30000,
      webPreferences: {
        preload: '/src/test/data/preload.js',
      },
    });

    return new Promise((resolve, reject) => {
      const _debug = require('debug')('nightmare');

      const iframe = '#injectedUnifiedLogin iframe';
      const emailSelector = { iframe, el: '#email' };
      const passwordSelector = { iframe, el: '#password' };

      function parseURL(newUrl) {
        if (newUrl.indexOf('cappasity') >= 0) {
          const parsed = url.parse(newUrl, true);
          const data = {
            payer_id: parsed.query.PayerID,
            payment_id: parsed.query.paymentId,
            token: parsed.query.token,
          };

          _debug('resolved data', data);
          resolve(data);
        }
      }

      function selectElement(selector, element) {
        // eslint-disable-next-line no-undef
        return __nightmare.qs({ iframe: selector, el: element });
      }

      browser
        .on('did-get-redirect-request', (events, oldUrl, newUrl) => {
          _debug('redirect to %s', newUrl);
          parseURL(newUrl);
        })
        .on('did-get-response-details', (event, status, newUrl) => {
          _debug('response from %s', newUrl);
          parseURL(newUrl);
        })
        .on('will-navigate', (event, newUrl) => {
          _debug('navigate to %s', newUrl);
          parseURL(newUrl);
        })
        .useragent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.87 Safari/537.36')
        .goto(saleUrl)
        .wait(3000)
        .screenshot('./ss/pre-email.png')
        .wait(selectElement, iframe, emailSelector.el)
        .type(emailSelector, false)
        .wait(1000)
        .type(emailSelector, 'test@cappacity.com')
        .type(passwordSelector, '12345678')
        .wait(3000)
        .screenshot('./ss/after-email.png')
        .click({ iframe, el: '#btnLogin' })
        .wait(3000)
        .screenshot('./ss/after-submit.png')
        .wait('#confirmButtonTop')
        .screenshot('./ss/pre-confirm.png')
        .click('#confirmButtonTop')
        .wait(3000)
        .screenshot('./ss/after-confirm.png')
        .end()
        .then(() => _debug('finished running', saleUrl))
        .catch((err) => {
          _debug('failed with error', err);
          reject(err);
        });
    });
  }

  before(() => {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before(() => {
    dispatch = simpleDispatcher(payments.router);
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create sale on invalid arguments', () => {
      return dispatch(createSale, { wrong: 'data' })
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should create sale', () => {
      return dispatch(createSale, testSaleData)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          sale = result.value();
        });
    });

    it('Should fail to execute unapproved sale', () => {
      return dispatch(executeSale, { payment_id: sale.sale.id, payer_id: 'doesntmatter' })
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should execute approved sale', () => {
      return approve(sale.url)
        .tap()
        .then((query) => {
          return dispatch(executeSale, query)
            .reflect()
            .then((result) => {
              debug(result);
              assert(result.isFulfilled());
            });
        });
    });

    it('Should create 3d printing sale', () => {
      return dispatch(createDynamicSale, testDynamicSaleData)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          sale = result.value();
        });
    });

    it('Should approve & execute 3d printing sale', () => {
      return approve(sale.url)
        .then((query) => {
          sinon.stub(payments.mailer, 'send').returns(Promise.resolve());

          return dispatch(executeSale, query)
            .reflect()
            .then((result) => {
              assert.ok(payments.mailer.send.calledOnce);

              // sinon restore
              payments.mailer.send.restore();

              debug(result);
              assert(result.isFulfilled());
            });
        });
    });

    it('Should list all sales', () => (
      dispatch(listSale, {})
        .reflect()
        .then((result) => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        })
    ));
  });
});
