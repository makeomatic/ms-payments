const assert = require('assert');
const Promise = require('bluebird');
const { inspectPromise } = require('@makeomatic/deploy');
const { duration, simpleDispatcher, clearRedis } = require('../../utils');

describe('Migrations suite', function PlansSuite() {
  const Payments = require('../../../src');
  const { testPlanData, freePlanData } = require('../../data/paypal');
  const planTitlesMigration = require('../../../src/migrations/plan-titles');

  this.timeout(duration);

  describe('unit tests', () => {
    const createPlan = 'payments.plan.create';
    const deletePlan = 'payments.plan.delete';

    let payments;
    let dispatch;
    let basicPlan;

    before('startService', async () => {
      payments = new Payments();
      await payments.connect();
      dispatch = simpleDispatcher(payments);
    });

    it('Should migrate plan titles', async () => {
      basicPlan = await dispatch(createPlan, { ...testPlanData, title: 'Basic' })
        .reflect()
        .then(inspectPromise());

      // Before migration
      assert.strictEqual(basicPlan.title, 'Basic');

      const { redis } = payments;

      assert.strictEqual(await redis.hget('plans-data:free', 'title'), '"Free"');
      assert.strictEqual(await redis.hget('plans-data:basic', 'title'), '"Basic"');

      await redis.set('version', 2);

      await payments.migrate('redis', [planTitlesMigration]);

      // After migration
      assert.strictEqual(await redis.hget('plans-data:free', 'title'), '"Free"');
      assert.strictEqual(await redis.hget('plans-data:basic', 'title'), '"Premium"');

      // Cleanup
      await dispatch(deletePlan, basicPlan.plan.id);
      basicPlan = null;
    });
  });
});
