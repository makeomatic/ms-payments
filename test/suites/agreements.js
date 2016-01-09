/* global TEST_CONFIG */
const { expect } = require('chai');
const Promise = require('bluebird');
const Browser = require('zombie');

function debug(result) {
  if (result.isRejected()) {
    const err = result.reason();
    console.log(require('util').inspect(err, { depth: 5 }) + '\n');
    console.log(err && err.stack || err);
    console.log(err && err.response || '');
  }
}

const duration = 20 * 1000;

describe('Agreements suite', function AgreementSuite() {
  const browser = new Browser({waitDuration: duration});
  const Payments = require('../../src');

  // mock paypal requests
  // require('../mocks/paypal');
  const { billingAgreementAttributes, billingPlanBase } = require('../data/paypal');

  const createPlanHeaders = { routingKey: 'payments.plan.create' };
  const deletePlanHeaders = { routingKey: 'payments.plan.delete' };
  const statePlanHeaders = { routingKey: 'payments.plan.state' };

  let planId;
  let payments;

  this.timeout(duration * 2);

  before(function startService() {
    payments = new Payments(TEST_CONFIG);
    return payments.connect()
      .then(function stub() {
        payments._amqp = {
          publishAndWait: () => {
            return Promise.resolve(true);
          },
        };
      });
  });

  before(function() {
    return payments.router(billingPlanBase, createPlanHeaders).then(function(plan) {
      const id = plan.id.split('|')[0];
      planId = id;
      billingAgreementAttributes.plan.id = id;
      return payments.router({ id, state: 'active' }, statePlanHeaders);
    });
  });

  after(function() {
    return payments.router(planId, deletePlanHeaders);
  });

  describe('unit tests', function UnitSuite() {
    const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
    const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };

    let billingAgreement;

    it('Should fail to create agreement on invalid schema', () => {
      return payments.router({ random: true }, createAgreementHeaders)
        .reflect()
        .then((result) => {
          expect(result.isRejected()).to.be.eq(true);
          expect(result.reason().name).to.be.eq('ValidationError');
        });
    });

    it('Should create an agreement', () => {
      const data = {
        agreement: billingAgreementAttributes,
        owner: 'test@test.com',
      };

      return payments.router(data, createAgreementHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          expect(result.isFulfilled()).to.be.eq(true);
          billingAgreement = result.value();
        });
    });

    it('Should fail to execute on an unknown token', () => {
      return payments.router('random token', executeAgreementHeaders)
        .reflect()
        .then((result) => {
          expect(result.isRejected()).to.be.eq(true);
        });
    });

    it('Should reject unapproved agreement', () => {
      return payments.router({ token: billingAgreement.token }, executeAgreementHeaders)
        .reflect()
        .then((result) => {
          expect(result.isRejected()).to.be.eq(true);
        });
    });

    it('Should execute an approved agreement', () => {
      return browser.visit(billingAgreement.url)
        .then(function() {
          return browser.pressButton('#loadLogin');
        })
        .then(function() {
          console.log('login loaded');
          browser
            .fill('#login_email', 'test@cappacity.com')
            .fill('#login_password', '12345678');
          return browser.pressButton('#submitLogin', function(err, b) {
            console.log(err);
            console.log(b);
          });
        })
        .then(function() {
          console.log('button pressed');
          return browser.pressButton('continue', function(err, b) {
            console.log(err);
            console.log(b);
          });
        })
        .then(function() {
          console.log('browser done');
          return payments.router({ token: billingAgreement.token }, executeAgreementHeaders)
            .reflect()
            .then((result) => {
              debug(result);
              expect(result.isFulfilled()).to.be.eq(true);
            });
        });
    });
  });
});
