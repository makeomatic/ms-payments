const TEST_CONFIG = require('../config');
const assert = require('assert');
const Promise = require('bluebird');
const { duration, simpleDispatcher } = require('../utils');
const { inspectPromise } = require('@makeomatic/deploy');

describe('Plans suite', function PlansSuite() {
  const Payments = require('../../src');
  const { testPlanData, freePlanData } = require('../data/paypal');

  this.timeout(duration);

  describe('unit tests', function UnitSuite() {
    const createPlan = 'payments.plan.create';
    const getPlan = 'payments.plan.get';
    const deletePlan = 'payments.plan.delete';
    const listPlan = 'payments.plan.list';
    const updatePlan = 'payments.plan.update';
    const statePlan = 'payments.plan.state';

    let payments;
    let billingPlan;
    let dispatch;
    let monthlyPlanId;

    before('delay for ms-users', () => Promise.delay(2000));

    before(function startService() {
      payments = new Payments(TEST_CONFIG);
      return payments.connect();
    });

    before(function addDispatcher() {
      dispatch = simpleDispatcher(payments);
    });

    it('Should create free plan', () => {
      return dispatch(createPlan, freePlanData)
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          assert(result.plan.id);
          return null;
        });
    });

    it('Should get free plan', () => {
      return dispatch(getPlan, 'free')
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          assert(result.alias);
          return null;
        });
    });

    it('Should fail to create on invalid plan schema', () => {
      const data = {
        something: 'useless',
      };

      return dispatch(createPlan, data)
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.name, 'ValidationError');
          return null;
        });
    });

    it('Should create a plan', () => {
      return dispatch(createPlan, {
        ...testPlanData,
        plan: {
          ...testPlanData.plan,
          state: 'CREATED',
        },
      })
        .reflect()
        .then(inspectPromise())
        .then((response) => {
          billingPlan = response;

          assert(billingPlan.plan.id);
          assert.equal(billingPlan.state.toLowerCase(), 'created');

          return null;
        });
    });

    it('Should fail to update on an unknown plan id', () => {
      return dispatch(updatePlan, { id: 'P-veryrandomid', hidden: true })
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.statusCode, 400);
          return null;
        });
    });

    it('Should fail to update on invalid plan schema', () => {
      return dispatch(updatePlan, { id: billingPlan.plan.id, plan: { invalid: true } })
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.name, 'ValidationError');
          return null;
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
        meta: {
          storage: {
            description: 'file storage',
            type: 'number',
            value: 0.5,
          },
        },
        level: 10,
      };

      return dispatch(updatePlan, updateData)
        .reflect()
        .then(inspectPromise());
    });

    it('get plan must return updated info', () => {
      return dispatch(getPlan, billingPlan.plan.id)
        .then((result) => {
          assert.deepEqual(result.meta, {
            storage: {
              description: 'file storage',
              type: 'number',
              value: 0.5,
            },
          });

          assert.equal(result.level, 10);

          // capture monthly id
          monthlyPlanId = result.month;

          return null;
        });
    });

    it('must return parent plan for a monthly plan', () => {
      return dispatch(getPlan, { id: monthlyPlanId, fetchParent: true })
        .then((result) => {
          assert.equal(billingPlan.plan.id, result.plan.id);
          assert.equal(billingPlan.month, result.month);

          // ensure we don't return the same plan
          assert.notEqual(monthlyPlanId, billingPlan.plan.id);
          return null;
        });
    });

    it('Should fail to activate on an invalid state', () => {
      return dispatch(statePlan, { id: 'P-random', state: 'invalid' })
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.name, 'ValidationError');
          return null;
        });
    });

    it('Should fail to activate on an unknown plan id', () => {
      return dispatch(statePlan, { id: 'P-random', state: 'active' })
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.inner_error.httpStatusCode, 400);
          return null;
        });
    });

    it('Should activate the plan', () => {
      return dispatch(statePlan, { id: billingPlan.plan.id, state: 'active' })
        .reflect()
        .then(inspectPromise());
    });

    it('Should fail to list on invalid query schema', () => {
      return dispatch(listPlan, { status: 'invalid' })
        .reflect()
        .then(inspectPromise(false))
        .then((error) => {
          assert.equal(error.name, 'ValidationError');
          return null;
        });
    });

    it('Should list all plans', () => {
      return dispatch(listPlan, {})
        .reflect()
        .then(inspectPromise());
    });

    it('Should fail to delete on an unknown plan id', () => {
      return dispatch(deletePlan, 'P-random')
        .reflect()
        .then(inspectPromise(false));
    });

    it('Should delete plan', () => {
      return dispatch(deletePlan, billingPlan.plan.id)
        .reflect()
        .then(inspectPromise());
    });

    it('Should fail to delete free plan', () => {
      return dispatch(deletePlan, 'free')
        .reflect()
        .then(inspectPromise(false));
    });
  });
});
