const Promise = require('bluebird');
const assert = require('assert');
const { init, clean, captureScreenshot, type, submit, wait, captureRedirect, scrollTo } = require('@makeomatic/deploy/bin/chrome');
const { inspectPromise } = require('@makeomatic/deploy');
const { duration, simpleDispatcher } = require('../utils');
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
    const { Page } = this.protocol;

    Page.navigate({ url: saleUrl });

    return Page.loadEventFired().then(() => (
      // sometimes input is flaky, how do we determine that everything has loaded?
      Promise
        .bind(this, '#loadLogin, #login_email')
        .tap(wait)
        .return([0, 0])
        .spread(scrollTo)
        .return('#loadLogin, #login_email')
        .then(submit)
        .return(['#login_email', 'test@cappasity.com'])
        .spread(type)
        .return(['#login_password', '12345678'])
        .spread(type)
        .return('#submitLogin')
        .then(submit)
        .return('#continue')
        .then(wait)
        .return('#continue')
        .then(submit)
        .return(/paypal-subscription-return\?/)
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

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before(function initPlan() {
    dispatch = simpleDispatcher(payments);
    return dispatch(createPlan, testPlanData).then((data) => {
      const id = data.plan.id.split('|')[0];
      planId = data.plan.id;
      testAgreementData.plan.id = id;
      return null;
    });
  });

  after(function cleanup() {
    return dispatch(deletePlan, planId).reflect();
  });

  // headless testing
  beforeEach('launch chrome', init);
  afterEach('clean chrome', clean);

  describe('unit tests', function UnitSuite() {
    it('Should fail to create agreement on invalid schema', () => {
      return dispatch(createAgreement, { random: true })
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.name, 'ValidationError');
          return null;
        });
    });

    it('By default user should have free agreement', () => {
      return dispatch(forUserAgreement, { user: 'test@test.ru' })
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          assert.equal(result.id, 'free');
          return null;
        });
    });

    it('Should create an agreement', () => {
      const data = {
        agreement: testAgreementData,
        owner: 'test@test.ru',
      };

      return dispatch(createAgreement, data)
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          billingAgreement = result;
          return null;
        });
    });

    it('Should fail to execute on an unknown token', () => {
      return dispatch(executeAgreement, 'random token')
        .reflect()
        .then(inspectPromise(false));
    });

    it('Should reject unapproved agreement', () => {
      return dispatch(executeAgreement, { token: billingAgreement.token })
        .reflect()
        .then(inspectPromise(false));
    });

    it('Should execute an approved agreement', function test() {
      return approve.call(this, billingAgreement.url).then(params => (
        dispatch(executeAgreement, { token: params.token })
          .reflect()
          .then(inspectPromise())
          .then((result) => {
            billingAgreement.id = result.id;
            return null;
          })
      ));
    });

    it('Should create a trial agreement', () => {
      const data = {
        agreement: testAgreementData,
        owner: 'test@test.ru',
        trialDiscount: 10,
      };

      return dispatch(createAgreement, data)
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          billingAgreement = result;
          return null;
        });
    });

    it('Should execute an approved trial agreement', function test() {
      return approve.call(this, billingAgreement.url).then(params => (
        dispatch(executeAgreement, { token: params.token })
          .reflect()
          .then(inspectPromise())
          .then((result) => {
            billingAgreement.id = result.id;
            return null;
          })
      ));
    });

    it('Should list all agreements', () => {
      return dispatch(listAgreement, {})
        .reflect()
        .then(inspectPromise());
    });

    it('Should get agreement for user', () => {
      return dispatch(forUserAgreement, { user: 'test@test.ru' })
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          assert.equal(result.agreement.id, billingAgreement.id);
          return null;
        });
    });

    it('Should pull updates for an agreement', () => {
      this.timeout(duration);

      function waitForAgreementToBecomeActive() {
        return dispatch(syncAgreements, {})
          .reflect()
          .then(inspectPromise())
          .then(() => dispatch(getAgreement, { id: billingAgreement.id }))
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
        .then(inspectPromise());
    });

    it('Should get free agreement for user after cancelling', () => {
      return dispatch(forUserAgreement, { user: 'test@test.ru' })
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          assert.equal(result.id, 'free');
          return null;
        });
    });
  });
});
