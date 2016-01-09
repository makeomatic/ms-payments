/* global TEST_CONFIG */
const { expect } = require('chai');
const Promise = require('bluebird');

function debug(result) {
  if (result.isRejected()) {
    const err = result.reason();
    process.stdout.write(require('util').inspect(err, { depth: 5 }) + '\n');
    process.stdout.write(err && err.stack || err);
    process.stdout.write(err && err.response || '');
  }
}

describe('Payments suite', function UserClassSuite() {
  const Payments = require('../../src');

  // mock paypal requests
  // require('../mocks/paypal');
  const { billingAgreementAttributes, billingPlanBase } = require('../data/paypal');

  this.timeout(20000);

  describe('unit tests', function UnitSuite() {
    const createPlanHeaders = { routingKey: 'payments.plan.create' };
    const deletePlanHeaders = { routingKey: 'payments.plan.delete' };
    const listPlanHeaders = { routingKey: 'payments.plan.list' };
    const updatePlanHeaders = { routingKey: 'payments.plan.update' };
    const statePlanHeaders = { routingKey: 'payments.plan.state' };

    const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
    const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };

    const createSaleHeaders = { routingKey: 'payments.sale.create' };

    let payments;
    let billingPlan;
    let billingAgreement;

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

    describe('plans#', function plansSuite() {
      it('Should fail to create on invalid plan schema', () => {
        const data = {
          something: 'useless',
        };

        return payments.router(data, createPlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
            expect(result.reason().name).to.be.eq('ValidationError');
          });
      });

      it('Should create a plan', () => {
        return payments.router(billingPlanBase, createPlanHeaders)
          .reflect()
          .then((result) => {
            debug(result);
            expect(result.isFulfilled()).to.be.eq(true);

            billingPlan = result.value();

            expect(billingPlan).to.have.ownProperty('id');
            expect(billingPlan.id).to.contain('P-');
            expect(billingPlan.state).to.contain('CREATED');
          });
      });

      it('Should fail to activate on an unknown plan id', () => {
        return payments.router({ id: 'random', state: 'active' }, statePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
            expect(result.reason().httpStatusCode).to.be.eq(400);
          });
      });

      it('Should fail to activate on an invalid state', () => {
        return payments.router({ id: 'random', state: 'invalid' }, statePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
            expect(result.reason().name).to.be.eq('ValidationError');
          });
      });

      it('Should activate the plan', () => {
        return payments.router({ id: billingPlan.id, state: 'active' }, statePlanHeaders)
          .reflect()
          .then((result) => {
            debug(result);
            expect(result.isFulfilled()).to.be.eq(true);
          });
      });

      it('Should fail to update on an unknown plan id', () => {
        return payments.router({ id: 'random', plan: { name: 'Updated name' } }, updatePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
            expect(result.reason().httpStatusCode).to.be.eq(400);
          });
      });

      it('Should fail to update on invalid plan schema', () => {
        return payments.router({ id: billingPlan.id, plan: { invalid: true } }, updatePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
            expect(result.reason().name).to.be.eq('ValidationError');
          });
      });

      /* it('Should update plan info', () => {
        const updateData = {
          id: billingPlan.id,
          plan: {
            name: 'Updated name',
          },
        };

        return payments.router(updateData, updatePlanHeaders)
          .reflect()
          .then((result) => {
            debug(result);
            expect(result.isFulfilled()).to.be.eq(true);
          });
      }); */

      it('Should fail to list on invalid query schema', () => {
        return payments.router({ status: 'invalid' }, listPlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
            expect(result.reason().name).to.be.eq('ValidationError');
          });
      });

      it('Should list all plans', () => {
        return payments.router({}, listPlanHeaders)
          .reflect()
          .then(result => {
            return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
          });
      });

      it('Should fail to delete on an unknown plan id', () => {
        return payments.router('random', deletePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
          });
      });

      it('Should delete plan', () => {
        return payments.router(billingPlan.id, deletePlanHeaders)
          .reflect()
          .then((result) => {
            expect(result.isFulfilled()).to.be.eq(true);
          });
      });
    });

    describe('agreements#', function agreementsSuite() {
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
        return payments.router(billingAgreement.token + '-UNAPPROVED', executeAgreementHeaders)
          .reflect()
          .then((result) => {
            expect(result.isRejected()).to.be.eq(true);
          });
      });

      it('Should execute an approved agreement', () => {
        return payments.router(billingAgreement.token, executeAgreementHeaders)
          .reflect()
          .then((result) => {
            debug(result);
            expect(result.isFulfilled()).to.be.eq(true);
          });
      });
    });
  });
});
