const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const url = require('url');
const sinon = require('sinon');
const { init, clean, captureScreenshot, type, submit, wait, captureRedirect } = require('@makeomatic/deploy/bin/chrome');
const { inspectPromise } = require('@makeomatic/deploy');
const { duration, simpleDispatcher } = require('../utils');

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
    const { Page } = this.protocol;

    // test case scenario
    Page.navigate({ url: saleUrl });
    return Page.loadEventFired().then(() => (
      // sometimes input is flaky, how do we determine that everything has loaded?
      Promise
        .bind(this, [{ iframe: '[name=injectedUl]', el: '#email' }, 'test@cappasity.com'])
        .delay(2000)
        .spread(type)
        .delay(500)
        .return([{ iframe: '[name=injectedUl]', el: '#password' }, '12345678'])
        .spread(type)
        .delay(500)
        .return({ iframe: '[name=injectedUl]', el: '#btnLogin' })
        .then(submit)
        .delay(500)
        .return('#confirmButtonTop')
        .then(wait)
        .delay(5000)
        .return('#confirmButtonTop')
        .then(submit)
        .return(/paypal-sale-return\?/)
        .then(captureRedirect)
        .catch(captureScreenshot)
        .then((response) => {
          // actual test verification goes on here
          const data = url.parse(response, true).query;
          return {
            payer_id: data.PayerID,
            payment_id: data.paymentId,
            token: data.token,
          };
        })
    ));
  }

  before(() => {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before(() => {
    dispatch = simpleDispatcher(payments);
  });

  // headless testing
  beforeEach('launch chrome', init);
  afterEach('clean chrome', clean);

  describe('Sales tests', function UnitSuite() {
    it('Should fail to create sale on invalid arguments', () => {
      return dispatch(createSale, { wrong: 'data' })
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.name, 'ValidationError');
          return null;
        });
    });

    it('Should create sale', () => {
      return dispatch(createSale, testSaleData)
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          sale = result;
          return null;
        });
    });

    it('Should fail to execute unapproved sale', () => {
      return dispatch(executeSale, { payment_id: sale.sale.id, payer_id: 'doesntmatter' })
        .reflect()
        .then(inspectPromise(false));
    });

    it('Should execute approved sale', function test() {
      return approve.call(this, sale.url).then(query => (
        dispatch(executeSale, query)
          .reflect()
          .then(inspectPromise())
      ));
    });

    it('Should create 3d printing sale', () => {
      return dispatch(createDynamicSale, testDynamicSaleData)
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          sale = result;
          return null;
        });
    });

    it('Should approve & execute 3d printing sale', function test() {
      return approve.call(this, sale.url).then((query) => {
        sinon.stub(payments.mailer, 'send').returns(Promise.resolve());

        return dispatch(executeSale, query)
          .reflect()
          .then(inspectPromise())
          .finally(() => {
            assert.ok(payments.mailer.send.calledOnce);
            payments.mailer.send.restore();
            return null;
          });
      });
    });

    it('Should list all sales', () => (
      dispatch(listSale, {}).reflect().then(inspectPromise())
    ));
  });
});
