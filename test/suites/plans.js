const TEST_CONFIG = require('../config');
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

    before('delay for ms-users', () => Promise.delay(2000));

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
          assert(result.value().plan.id);
        });
    });

    it('Should get free plan', () => {
      return payments.router('free', getPlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
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
      return payments
        .router({
          ...testPlanData,
          plan: {
            ...testPlanData.plan,
            state: 'CREATED',
          },
        }, createPlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());

          billingPlan = result.value();

          assert(billingPlan.plan.id);
          assert.equal(billingPlan.state.toLowerCase(), 'created');
        });
    });

    it('Should fail to update on an unknown plan id', () => {
      return payments.router({ id: 'P-veryrandomid', hidden: true }, updatePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().statusCode, 400);
        });
    });

    it('Should fail to update on invalid plan schema', () => {
      return payments.router({ id: billingPlan.plan.id, plan: { invalid: true } }, updatePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should update plan info', () => {
      const updateData = {
        id: billingPlan.plan.id,
        alias: 'thesupermaster',
        subscriptions: {
          monthly: {
            models: 100,
          },
          yearly: {
            modelPrice: 10.5,
          },
        },
      };

      return payments.router(updateData, updatePlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

    it('Should fail to activate on an invalid state', () => {
      return payments.router({ id: 'P-random', state: 'invalid' }, statePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
        });
    });

    it('Should fail to activate on an unknown plan id', () => {
      return payments.router({ id: 'P-random', state: 'active' }, statePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().httpStatusCode, 400);
        });
    });

    it('Should activate the plan', () => {
      return payments.router({ id: billingPlan.plan.id, state: 'active' }, statePlanHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
        });
    });

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
        .then((result) => {
          return result.isFulfilled() ? result.value() : Promise.reject(result.reason());
        });
    });

    it('Should fail to delete on an unknown plan id', () => {
      return payments.router('P-random', deletePlanHeaders)
        .reflect()
        .then((result) => {
          assert(result.isRejected());
        });
    });

    it('Should delete plan', () => {
      return payments.router(billingPlan.plan.id, deletePlanHeaders)
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
          assert(result.isRejected());
        });
    });
  });
});
