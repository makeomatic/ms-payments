const assert = require('assert');
const Promise = require('bluebird');
const find = require('lodash/find');
const { inspectPromise } = require('@makeomatic/deploy');
const { duration, simpleDispatcher } = require('../../utils');

describe('Plans suite', function PlansSuite() {
  const Payments = require('../../../src');
  const { testPlanData, freePlanData } = require('../../data/paypal');

  this.timeout(duration);

  describe('unit tests', () => {
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

    before('startService', async () => {
      payments = new Payments();
      await payments.connect();
      dispatch = simpleDispatcher(payments);
    });

    it('Should create free plan', async () => {
      const result = await dispatch(createPlan, freePlanData)
        .reflect()
        .then(inspectPromise());

      assert(result.plan.id);
    });

    it('Should get free plan', async () => {
      const result = await dispatch(getPlan, 'free')
        .reflect()
        .then(inspectPromise());

      assert(result.alias);
    });

    it('Should fail to create on invalid plan schema', async () => {
      const data = {
        something: 'useless',
      };

      const error = await dispatch(createPlan, data)
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.name, 'HttpStatusError');
    });

    it('Should create a plan', async () => {
      const opts = {
        ...testPlanData,
        plan: {
          ...testPlanData.plan,
          state: 'CREATED',
        },
      };

      billingPlan = await dispatch(createPlan, opts)
        .reflect()
        .then(inspectPromise());

      assert(billingPlan.plan.id);
      assert.equal(billingPlan.state.toLowerCase(), 'created');
    });

    it('Should fail to update on an unknown plan id', async () => {
      const error = await dispatch(updatePlan, { id: 'P-veryrandomid', hidden: true })
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.statusCode, 400);
    });

    it('Should fail to update on invalid plan schema', async () => {
      const error = await dispatch(updatePlan, { id: billingPlan.plan.id, plan: { invalid: true } })
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.name, 'HttpStatusError');
    });

    it('Should update plan info', async () => {
      const updateData = {
        id: billingPlan.plan.id,
        alias: 'thesupermaster',
        title: 'The Super Master',
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

      const result = await dispatch(updatePlan, updateData);
      const hasSubscriptionName = (needle) => ({ name }) => name === needle;

      assert.strictEqual(result.title, 'The Super Master');
      assert.strictEqual(result.alias, 'thesupermaster');
      assert.strictEqual(find(result.subs, hasSubscriptionName('month')).models, 100);
      assert.strictEqual(find(result.subs, hasSubscriptionName('year')).price, 10.5);
      assert.strictEqual(result.level, 10);
      assert.strictEqual(result.meta.storage.value, 0.5);
    });

    it('get plan must return updated info', async () => {
      const result = await dispatch(getPlan, billingPlan.plan.id);

      assert.deepEqual(result.meta, {
        storage: {
          description: 'file storage',
          type: 'number',
          value: 0.5,
        },
      });

      assert.equal(result.level, 10);
      monthlyPlanId = result.month;
    });

    it('must return parent plan for a monthly plan', async () => {
      const result = await dispatch(getPlan, { id: monthlyPlanId, fetchParent: true });

      assert.equal(billingPlan.plan.id, result.plan.id);
      assert.equal(billingPlan.month, result.month);

      // ensure we don't return the same plan
      assert.notEqual(monthlyPlanId, billingPlan.plan.id);
    });

    it('Should fail to activate on an invalid state', async () => {
      const error = await dispatch(statePlan, { id: 'P-random', state: 'invalid' })
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.name, 'HttpStatusError');
    });

    it('Should fail to activate on an unknown plan id', async () => {
      const error = await dispatch(statePlan, { id: 'P-random', state: 'active' })
        .reflect()
        .then(inspectPromise(false));

      assert([400, 500].includes(error.inner_error.httpStatusCode));
    });

    it('Should activate the plan', () => {
      return dispatch(statePlan, { id: billingPlan.plan.id, state: 'active' })
        .reflect()
        .then(inspectPromise());
    });

    it('Should fail to list on invalid query schema', async () => {
      const error = await dispatch(listPlan, { status: 'invalid' })
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.name, 'HttpStatusError');
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
