const Promise = require('bluebird');
const assert = require('assert');
const Nightmare = require('nightmare');
const { debug, duration } = require('../utils');
const TEST_CONFIG = require('../config');
const url = require('url');
const once = require('lodash/once');

describe('Agreements suite', function AgreementSuite() {
  const Payments = require('../../src');

  // mock paypal requests
  // require('../mocks/paypal');
  const { testAgreementData, testPlanData } = require('../data/paypal');

  const createPlanHeaders = { routingKey: 'payments.plan.create' };
  const deletePlanHeaders = { routingKey: 'payments.plan.delete' };

  const getAgreementHeaders = { routingKey: 'payments.agreement.get' };
  const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
  const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };
  const stateAgreementHeaders = { routingKey: 'payments.agreement.state' };
  const listAgreementHeaders = { routingKey: 'payments.agreement.list' };
  const forUserAgreementHeaders = { routingKey: 'payments.agreement.forUser' };
  const syncAgreementsHeaders = { routingKey: 'payments.agreement.sync' };
  // const billAgreementHeaders = { routingKey: 'payments.agreement.bill' };

  let billingAgreement;
  let planId;
  let payments;

  this.timeout(duration * 8);

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
        .wait(10000)
        .screenshot('./ss/after-confirm.png')
        .end()
        .then(() => {
          console.log('completed running %s', saleUrl); // eslint-disable-line
        });
    });
  }

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before(function initPlan() {
    return payments.router(testPlanData, createPlanHeaders).then(data => {
      const id = data.plan.id.split('|')[0];
      planId = data.plan.id;
      testAgreementData.plan.id = id;
    });
  });

  after(function deletePlan() {
    return payments.router(planId, deletePlanHeaders);
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create agreement on invalid schema', () => {
      return payments.router({ random: true }, createAgreementHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('By default user should have free agreement', () => {
      return payments
        .router({ user: 'test@test.ru' }, forUserAgreementHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          assert.equal(result.value().id, 'free');
        });
    });

    it('Should create an agreement', () => {
      const data = {
        agreement: testAgreementData,
        owner: 'test@test.ru',
      };

      return payments.router(data, createAgreementHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          billingAgreement = result.value();
        });
    });

    it('Should fail to execute on an unknown token', () => {
      return payments.router('random token', executeAgreementHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should reject unapproved agreement', () => {
      return payments.router({ token: billingAgreement.token }, executeAgreementHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should execute an approved agreement', () => {
      return approve(billingAgreement.url)
        .then(() => {
          return payments.router({ token: billingAgreement.token }, executeAgreementHeaders)
            .reflect()
            .then(result => {
              debug(result);
              assert(result.isFulfilled());
              billingAgreement.id = result.value().id;
            });
        });
    });

    it('Should list all agreements', () => {
      return payments.router({}, listAgreementHeaders)
        .reflect()
        .then(result => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        });
    });

    it('Should get agreement for user', () => {
      return payments.router({ user: 'test@test.ru' }, forUserAgreementHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          assert.equal(result.value().agreement.id, billingAgreement.id);
        });
    });

    it('Should pull updates for an agreement', () => {
      this.timeout(duration);

      function waitForAgreementToBecomeActive() {
        return payments.router({}, syncAgreementsHeaders)
          .reflect()
          .then(result => {
            assert(result.isFulfilled());
          })
          .then(() => {
            return payments.router({ id: billingAgreement.id }, getAgreementHeaders);
          })
          .then(agreement => {
            if (agreement.state.toLowerCase() === 'pending') {
              return Promise.delay(500).then(waitForAgreementToBecomeActive);
            }

            return null;
          });
      }

      return waitForAgreementToBecomeActive();
    });

    // this test is perf
    it('Should cancel agreement', () => {
      return payments.router({ owner: 'test@test.ru', state: 'cancel' }, stateAgreementHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

    it('Should get free agreement for user after cancelling', () => {
      return payments.router({ user: 'test@test.ru' }, forUserAgreementHeaders)
        .reflect()
        .then((result) => {
          assert(result.isFulfilled());
          assert.equal(result.value().id, 'free');
        });
    });
  });
});
