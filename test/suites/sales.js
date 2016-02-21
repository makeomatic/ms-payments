const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
// const Browser = require('zombie');
const url = require('url');
const { debug, duration } = require('../utils');

describe('Sales suite', function SalesSuite() {
  // const browser = new Browser({ runScripts: false, waitDuration: duration });
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
    payments.log.debug('approving sale %s', saleUrl);

    return new Promise(resolve => {
      // FIXME: manually enter redirect URL
      process.stdout.write(`PASTE INTO BROWSER AND ADD RESPONSE URL:\n\n${saleUrl}\n\n`);

      process.stdin.once('data', redirectURL => {
        const parsed = url.parse(redirectURL.toString(), true);
        resolve({ payer_id: parsed.query.PayerID, payment_id: parsed.query.paymentId });
      });
    });

    // FIXME: paypal only runs with js and zombie doesn't work with it
    // These tests worked earlier, but not anymore
    //
    // const cappacity = new Promise(resolve => {
    //   browser.on('redirect', (request, response, redirectURL) => {
    //     payments.log.debug('request.url redirect %s', redirectURL);
    //     if (redirectURL.indexOf('cappasity') >= 0) {
    //       const parsed = url.parse(redirectURL, true);
    //       resolve({ payer_id: parsed.query.PayerID, payment_id: parsed.query.paymentId });
    //     }
    //   });
    // });
    //
    // return browser
    //   .visit(saleUrl)
    //   .then(() => {
    //     browser.assert.success();
    //     return browser.pressButton('#loadLogin');
    //   })
    //   .catch(err => {
    //     assert.equal(err.message, 'No BUTTON \'#loadLogin\'', err.message);
    //     return { success: true, err };
    //   })
    //   .then(() =>
    //     browser
    //       .fill('#email', 'test@cappacity.com')
    //       .fill('#password', '12345678')
    //       .pressButton('input[name=_eventId_submit]')
    //   )
    //   .then(() =>
    //     // TypeError: unable to verify the first certificate
    //     Promise.join(
    //       browser
    //         .pressButton('#confirmButtonTop')
    //         .catch(err => {
    //           const idx = [
    //             'Timeout: did not get to load all resources on this page',
    //             'unable to verify the first certificate',
    //           ].indexOf(err.message);
    //           assert.notEqual(idx, -1, 'failed to contact server on paypal redirect back');
    //           return { success: true, err };
    //         }),
    //       cappacity
    //     )
    //     .get(1)
    //   );
  }

  before(() => {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create sale on invalid arguments', () => {
      return payments
        .router({ wrong: 'data' }, createSaleHeaders)
        .reflect()
        .then(result => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should create sale', () => {
      return payments
        .router(testSaleData, createSaleHeaders)
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
      if (process.env.CI) {
        return null;
      }

      return approve(sale.url)
        .then(query => (
          payments
            .router(query, executeSaleHeaders)
            .reflect()
            .then(result => {
              debug(result);
              assert(result.isFulfilled());
            })
        ));
    });

    it('Should create 3d printing sale', () => {
      return payments
        .router(testDynamicSaleData, createDynamicSaleHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          sale = result.value();
        });
    });

    it('Should approve & execute 3d printing sale', () => {
      if (process.env.CI) {
        return null;
      }

      return approve(sale.url)
        .then(query => (
          payments
            .router(query, executeSaleHeaders)
            .reflect()
            .then(result => {
              debug(result);
              assert(result.isFulfilled());
            })
        ));
    });

    it('Should list all sales', () =>
      payments
        .router({}, listSaleHeaders)
        .reflect()
        .then(result => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        })
    );
  });
});
