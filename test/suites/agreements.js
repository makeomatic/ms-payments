/* global TEST_CONFIG */
const Promise = require('bluebird');
const { expect } = require('chai');
const Browser = require('zombie');

function debug(result) {
  if (result.isRejected()) {
    const err = result.reason();
    console.log(require('util').inspect(err, { depth: 5 }) + '\n'); // eslint-disable-line
    console.log(err && err.stack || err); // eslint-disable-line
    console.log(err && err.response || ''); // eslint-disable-line
  }
}

const duration = 20 * 1000;

describe('Agreements suite', function AgreementSuite() {
  const browser = new Browser({ runScripts: false, waitDuration: duration });
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

  before(function initPlan() {
    return payments.router(billingPlanBase, createPlanHeaders).then(plan => {
      const id = plan.id.split('|')[0];
      planId = id;
      billingAgreementAttributes.plan.id = id;
      return payments.router({ id, state: 'active' }, statePlanHeaders);
    });
  });

  after(function deletePlan() {
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
              expect(err.message).to.be.eq('unable to verify the first certificate');
              return { success: true, err };
            });
        })
        .then(() => {
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
