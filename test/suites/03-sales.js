const Promise = require('bluebird');
const assert = require('assert');
const sinon = require('sinon');
const { inspectPromise } = require('@makeomatic/deploy');
const { initChrome, closeChrome, approveSale } = require('../helpers/chrome');
const TEST_CONFIG = require('../config');
const { duration, simpleDispatcher } = require('../utils');

describe('Sales suite', function SalesSuite() {
  const Payments = require('../../src');

  const { testSaleData, testDynamicSaleData } = require('../data/paypal');
  const createSale = 'payments.sale.create';
  const createDynamicSale = 'payments.sale.createDynamic';
  const executeSale = 'payments.sale.execute';
  const listSale = 'payments.sale.list';

  this.timeout(duration * 5);
  this.retries(4);

  let payments;
  let sale;
  let dispatch;

  before('start service', async () => {
    payments = new Payments(TEST_CONFIG);
    await payments.connect();
    dispatch = simpleDispatcher(payments);
  });

  beforeEach('init Chrome', initChrome);
  afterEach('close chrome', closeChrome);

  describe('Sales tests', function UnitSuite() {
    it('Should fail to create sale on invalid arguments', async () => {
      const error = await dispatch(createSale, { wrong: 'data' })
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.name, 'HttpStatusError');
    });

    it('Should create sale', async () => {
      sale = await dispatch(createSale, testSaleData);
    });

    it('Should fail to execute unapproved sale', () => {
      return dispatch(executeSale, { payment_id: sale.sale.id, payer_id: 'doesntmatter' })
        .reflect()
        .then(inspectPromise(false));
    });

    it('Should execute approved sale', async () => {
      const query = await approveSale(sale.url);
      await dispatch(executeSale, query);
    });

    it('Should create 3d printing sale', async () => {
      sale = await dispatch(createDynamicSale, testDynamicSaleData);
    });

    it('Should approve & execute 3d printing sale', async () => {
      const query = await approveSale(sale.url);

      sinon.stub(payments.mailer, 'send').returns(Promise.resolve());

      try {
        await dispatch(executeSale, query);
        assert.ok(payments.mailer.send.calledOnce);
      } finally {
        payments.mailer.send.restore();
      }
    });

    it('Should list all sales', () => (
      dispatch(listSale, {})
    ));
  });
});
