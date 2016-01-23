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
  const statePlanHeaders = { routingKey: 'payments.plan.state' };
  const deletePlanHeaders = { routingKey: 'payments.plan.delete' };

  const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
  const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };

  this.timeout(duration * 2);

  let payments;
  let agreement;
  let planId;

  before('delay for ms-users', () => Promise.delay(2000));

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before(function initPlan() {
    return payments.router(testPlanData, createPlanHeaders).then(plan => {
      const id = plan.id.split('|')[0];
      testAgreementData.plan.id = id;
      planId = id;
      return payments.router({ id, state: 'active' }, statePlanHeaders);
    });
  });

  before(function createAgreement() {
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

  before(function executeAgreement() {
    return browser.visit(agreement.url)
      .then(() => {
        browser.assert.success();
        return browser.pressButton('#loadLogin');
      })
      .then(() => {
        return browser
          .fill('#login_email', 'test@cappacity.com')
          .fill('#login_password', '12345678')
          .pressButton('#submitLogin');
      })
      .then(() => {
        // TypeError: unable to verify the first certificate
        return browser
          .pressButton('#continue')
          .catch(err => {
            assert.equal(err.message, 'connect ECONNREFUSED 127.0.0.1:80');
            return { success: true, err };
          });
      })
      .then(() => {
        return payments.router({ token: agreement.token }, executeAgreementHeaders)
          .reflect()
          .then((result) => {
            debug(result);
            assert(result.isFulfilled());
            agreement = result.value();
          });
      });
  });

  before(function getAgreement() {
    return payments.router({ user: 'test@test.ru' }, getAgreementHeaders)
      .get('agreement')
      .then((result) => {
        assert(agreement.id, result.id);
      });
  });

  after(function cleanUp() {
    return Promise.all([
      payments.router(planId, deletePlanHeaders),
    ]);
  });

  describe('unit tests', function UnitSuite() {
    it('Should not sync transaction on invalid data', function test() {
      return payments.router({ wrong: 'data' }, syncTransactionHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should sync transactions', function test() {
      const start = '2015-01-01';
      const end = '2016-12-31';
      return payments.router({ id: agreement.id, start, end }, syncTransactionHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

    it('Should list all transactions', () => {
      return payments.router({}, listTransactionHeaders)
        .reflect()
        .then(result => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        });
    });
  });
});
