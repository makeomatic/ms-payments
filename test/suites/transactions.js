const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const once = require('lodash/once');
const url = require('url');
const Nightmare = require('nightmare');
const { debug, duration } = require('../utils');
const { testAgreementData, testPlanData } = require('../data/paypal');

describe('Transactions suite', function TransactionsSuite() {
  const Payments = require('../../src');

  const syncTransactionHeaders = { routingKey: 'payments.transaction.sync' };
  const listTransactionHeaders = { routingKey: 'payments.transaction.list' };

  const getAgreementHeaders = { routingKey: 'payments.agreement.forUser' };

  const createPlanHeaders = { routingKey: 'payments.plan.create' };
  const deletePlanHeaders = { routingKey: 'payments.plan.delete' };

  const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
  const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };

  this.timeout(duration * 4);

  let payments;
  let agreement;
  let planId;

  function approve(saleUrl) {
    const browser = new Nightmare({
      waitTimeout: 15000,
    });

    return new Promise(_resolve => {
      const resolve = once(_resolve);

      const _debug = require('debug')('nightmare');

      function parseURL(newUrl) {
        if (newUrl.indexOf('cappasity') >= 0) {
          const parsed = url.parse(newUrl, true);
          resolve({ payer_id: parsed.query.PayerID, payment_id: parsed.query.paymentId });
        }
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
        .goto(saleUrl)
        .screenshot('./ss/pre-email.png')
        .wait('#loadLogin')
        .click('#loadLogin')
        .wait('#login_email')
        .type('#login_email', false)
        .wait(3000)
        .type('#login_email', 'test@cappacity.com')
        .type('#login_password', '12345678')
        .wait(3000)
        .screenshot('./ss/after-email.png')
        .click('#submitLogin')
        .screenshot('./ss/right-after-submit.png')
        .wait(3000)
        .screenshot('./ss/after-submit.png')
        .wait('#continue')
        .screenshot('./ss/pre-confirm.png')
        .click('#continue')
        .screenshot('./ss/right-after-confirm.png')
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
    approve(agreement.url)
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
        .then(result => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        })
    ));
  });
});
