const Promise = require('bluebird');
const assert = require('assert');
const Browser = require('zombie');
const { debug, duration } = require('../utils');
const TEST_CONFIG = require('../config');

describe('Agreements suite', function AgreementSuite() {
  const browser = new Browser({ runScripts: false, waitDuration: duration * 2 });
  const Payments = require('../../lib');

  // mock paypal requests
  // require('../mocks/paypal');
  const { testAgreementData, testPlanData } = require('../data/paypal');

  const createPlanHeaders = { routingKey: 'payments.plan.create' };
  const deletePlanHeaders = { routingKey: 'payments.plan.delete' };
  const statePlanHeaders = { routingKey: 'payments.plan.state' };

  const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
  const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };
  const stateAgreementHeaders = { routingKey: 'payments.agreement.state' };
  const listAgreementHeaders = { routingKey: 'payments.agreement.list' };
  const forUserAgreementHeaders = { routingKey: 'payments.agreement.forUser' };
  const billAgreementHeaders = { routingKey: 'payments.agreement.bill' };

  let billingAgreement;
  let planId;
  let payments;

  this.timeout(duration * 2);

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before(function initPlan() {
    return payments.router(testPlanData, createPlanHeaders).then(plan => {
      const id = plan.id.split('|')[0];
      planId = id;
      testAgreementData.plan.id = id;
      return payments.router({ id, state: 'active' }, statePlanHeaders);
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
      return payments.router({ user: 'test@test.ru' }, forUserAgreementHeaders)
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
      return browser.visit(billingAgreement.url)
        .then(() => {
          browser.assert.success();
          return browser
            .pressButton('#loadLogin')
            .catch(err => {
              assert.equal(err.message, 'No BUTTON \'#loadLogin\'');
              return { success: true, err };
            });
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
              assert.equal(err.message, 'unable to verify the first certificate');
              return { success: true, err };
            });
        })
        .then(() => {
          return payments.router({ token: billingAgreement.token }, executeAgreementHeaders)
            .reflect()
            .then((result) => {
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
