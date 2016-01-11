/* global TEST_CONFIG */
const assert = require('assert');
const Promise = require('bluebird');
const { debug, duration } = require('../utils');

describe('Plans suite', function PlansSuite() {
  const Payments = require('../../src');

  // mock paypal requests
  // require('../mocks/paypal');
  const { testPlanData, freePlanData } = require('../data/paypal');

  this.timeout(duration);

  describe('unit tests', function UnitSuite() {
    const createPlanHeaders = { routingKey: 'payments.plan.create' };
    const getPlanHeaders = { routingKey: 'payments.plan.get' };
    const deletePlanHeaders = { routingKey: 'payments.plan.delete' };
    const listPlanHeaders = { routingKey: 'payments.plan.list' };
    const updatePlanHeaders = { routingKey: 'payments.plan.update' };
    const statePlanHeaders = { routingKey: 'payments.plan.state' };

    let payments;
    let billingPlan;

    before(function startService() {
      payments = new Payments(TEST_CONFIG);
      return payments.connect();
    });

    it('Should create free plan', () => {
      return payments.router(freePlanData, createPlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          assert(result.value().id);
        });
    });

    it('Should get free plan', () => {
      return payments.router('free', getPlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());

          //console.log(require('util').inspect(result.value(), { depth: 5 }));

          assert(result.value().alias);
        });
    });

    it('Should fail to create on invalid plan schema', () => {
      const data = {
        something: 'useless',
      };

      return payments.router(data, createPlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should create a plan', () => {
      return payments.router(testPlanData, createPlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());

          billingPlan = result.value();

          assert(billingPlan.id);
          assert.equal(billingPlan.state, 'CREATED');
        });
    });

    it('Should fail to activate on an unknown plan id', () => {
      return payments.router({ id: 'random', state: 'active' }, statePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().httpStatusCode, 400);
        });
    });

    it('Should fail to activate on an invalid state', () => {
      return payments.router({ id: 'random', state: 'invalid' }, statePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should activate the plan', () => {
      return payments.router({ id: billingPlan.id, state: 'active' }, statePlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

    it('Should fail to update on an unknown plan id', () => {
      return payments.router({ id: 'random', plan: { name: 'Updated name' } }, updatePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().httpStatusCode, 400);
        });
    });

    it('Should fail to update on invalid plan schema', () => {
      return payments.router({ id: billingPlan.id, plan: { invalid: true } }, updatePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
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
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
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
          assert(result.isRejected());
        });
    });

    it('Should delete plan', () => {
      return payments.router(billingPlan.id, deletePlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

    it('Should delete free plan', () => {
      return payments.router('free', deletePlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });
  });
});
