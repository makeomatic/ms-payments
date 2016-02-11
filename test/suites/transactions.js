const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const Browser = require('zombie');
const { debug, duration } = require('../utils');
const { testAgreementData, testPlanData } = require('../data/paypal');

describe('Transactions suite', function TransactionsSuite() {
  const Payments = require('../../src');
  const browser = new Browser({ runScripts: false, waitDuration: duration });

  const syncTransactionHeaders = { routingKey: 'payments.transaction.sync' };
  const listTransactionHeaders = { routingKey: 'payments.transaction.list' };

  const getAgreementHeaders = { routingKey: 'payments.agreement.forUser' };

  const createPlanHeaders = { routingKey: 'payments.plan.create' };
  const deletePlanHeaders = { routingKey: 'payments.plan.delete' };

  const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
  const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };

  this.timeout(duration * 2);

  let payments;
  let agreement;
  let planId;

  before('delay for ms-users', () => Promise.delay(2000));

  before(() => {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before('initPlan', () => (
    payments.router(testPlanData, createPlanHeaders).then(data => {
      const id = data.plan.id.split('|')[0];
      testAgreementData.plan.id = id;
      planId = data.plan.id;
    })
  ));

  before('createAgreement', () => {
    const data = {
      agreement: testAgreementData,
      owner: 'test@test.ru',
    };

    return payments.router(data, createAgreementHeaders)
      .reflect()
      .then((result) => {
        debug(result);
        assert(result.isFulfilled());
        agreement = result.value();
      });
  });

  before('executeAgreement', () => (
    browser.visit(agreement.url)
      .then(() => {
        browser.assert.success();
        return browser.pressButton('#loadLogin');
      })
      .then(() => (
        browser
          .fill('#login_email', 'test@cappacity.com')
          .fill('#login_password', '12345678')
          .pressButton('#submitLogin')
      ))
      .then(() => (
        // TypeError: unable to verify the first certificate
        browser
          .pressButton('#continue')
          .catch(err => {
            assert.equal(err.message, 'unable to verify the first certificate');
            return { success: true, err };
          })
      ))
      .then(() => (
        payments.router({ token: agreement.token }, executeAgreementHeaders)
          .reflect()
          .then((result) => {
            debug(result);
            assert(result.isFulfilled());
            agreement = result.value();
          })
      ))
  ));

  before('getAgreement', () => (
    payments.router({ user: 'test@test.ru' }, getAgreementHeaders)
      .get('agreement')
      .then((result) => {
        assert(agreement.id, result.id);
      })
  ));

  after('cleanUp', () => payments.router(planId, deletePlanHeaders));

  describe('unit tests', () => {
    it('Should not sync transaction on invalid data', () => (
      payments.router({ wrong: 'data' }, syncTransactionHeaders)
        .reflect()
        .then(result => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        })
    ));

    it('Should sync transactions', () => {
      const start = '2015-01-01';
      const end = '2016-12-31';
      return payments.router({ id: agreement.id, start, end }, syncTransactionHeaders)
        .reflect()
        .then(result => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

    it('Should list all transactions', () => (
      payments.router({}, listTransactionHeaders)
        .reflect()
        .then(result => (
          result.isFulfilled() ? result.value() : Promise.reject(result.reason())
        ))
    ));
  });
});
