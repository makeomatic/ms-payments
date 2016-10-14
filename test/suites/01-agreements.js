const Promise = require('bluebird');
const assert = require('assert');
const Nightmare = require('nightmare');
const { debug, duration, simpleDispatcher } = require('../utils');
const TEST_CONFIG = require('../config');
const url = require('url');

describe('Agreements suite', function AgreementSuite() {
  const Payments = require('../../src');

  const { testAgreementData, testPlanData } = require('../data/paypal');

  const createPlan = 'payments.plan.create';
  const deletePlan = 'payments.plan.delete';
  const getAgreement = 'payments.agreement.get';
  const createAgreement = 'payments.agreement.create';
  const executeAgreement = 'payments.agreement.execute';
  const stateAgreement = 'payments.agreement.state';
  const listAgreement = 'payments.agreement.list';
  const forUserAgreement = 'payments.agreement.forUser';
  const syncAgreements = 'payments.agreement.sync';

  let billingAgreement;
  let planId;
  let payments;
  let dispatch;

  this.timeout(duration * 8);

  function approve(saleUrl) {
    const browser = new Nightmare({
      waitTimeout: 15000,
      webPreferences: {
        preload: '/src/test/data/preload.js',
      },
    });

    return new Promise((resolve, reject) => {
      const _debug = require('debug')('nightmare');

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
        .then(() => _debug('finished running'))
        .catch((err) => {
          _debug('failed with error', err);
          reject(err);
        });
    });
  }

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before(function initPlan() {
    dispatch = simpleDispatcher(payments.router);
    return dispatch(createPlan, testPlanData).then((data) => {
      const id = data.plan.id.split('|')[0];
      planId = data.plan.id;
      testAgreementData.plan.id = id;
    });
  });

  after(function cleanup() {
    return dispatch(deletePlan, planId);
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create agreement on invalid schema', () => {
      return dispatch(createAgreement, { random: true })
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('By default user should have free agreement', () => {
      return dispatch(forUserAgreement, { user: 'test@test.ru' })
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

      return dispatch(createAgreement, data)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          billingAgreement = result.value();
        });
    });

    it('Should fail to execute on an unknown token', () => {
      return dispatch(executeAgreement, 'random token')
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should reject unapproved agreement', () => {
      return dispatch(executeAgreement, { token: billingAgreement.token })
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should execute an approved agreement', () => {
      return approve(billingAgreement.url)
        .then((params) => {
          return dispatch(executeAgreement, { token: params.token })
            .reflect()
            .then((result) => {
              debug(result);
              assert(result.isFulfilled());
              billingAgreement.id = result.value().id;
            });
        });
    });

    it('Should list all agreements', () => {
      return dispatch(listAgreement, {})
        .reflect()
        .then((result) => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        });
    });

    it('Should get agreement for user', () => {
      return dispatch(forUserAgreement, { user: 'test@test.ru' })
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
        return dispatch(syncAgreements, {})
          .reflect()
          .then((result) => {
            assert(result.isFulfilled());
          })
          .then(() => {
            return dispatch(getAgreement, { id: billingAgreement.id });
          })
          .then((agreement) => {
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
      return dispatch(stateAgreement, { owner: 'test@test.ru', state: 'cancel' })
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

    it('Should get free agreement for user after cancelling', () => {
      return dispatch(forUserAgreement, { user: 'test@test.ru' })
        .reflect()
        .then((result) => {
          assert(result.isFulfilled());
          assert.equal(result.value().id, 'free');
        });
    });
  });
});
