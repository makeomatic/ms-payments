const Promise = require('bluebird');
const assert = require('assert');
const { inspectPromise } = require('@makeomatic/deploy');
const { duration, simpleDispatcher } = require('../utils');
const { initChrome, closeChrome, approveSubscription } = require('../helpers/chrome');
const TEST_CONFIG = require('../config');

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

  this.timeout(duration * 16);

  before('startService', async () => {
    payments = new Payments(TEST_CONFIG);
    await payments.connect();
    dispatch = simpleDispatcher(payments);
  });

  before('initPlan', async () => {
    const data = await dispatch(createPlan, testPlanData);
    const id = data.plan.id.split('|')[0];

    planId = data.plan.id;
    testAgreementData.plan.id = id;
  });

  after(() => {
    return dispatch(deletePlan, planId).reflect();
  });

  beforeEach('init Chrome', initChrome);
  afterEach('close chrome', closeChrome);

  describe('unit tests', function UnitSuite() {
    it('Should fail to create agreement on invalid schema', async () => {
      const error = await dispatch(createAgreement, { random: true })
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.name, 'HttpStatusError');
    });

    it('By default user should have free agreement', async () => {
      const result = await dispatch(forUserAgreement, { user: 'pristine@test.ru' });
      assert.equal(result.id, 'free');
      assert.equal(result.agreement.id, 'free');
    });

    it('Should create an agreement', async () => {
      const data = {
        agreement: testAgreementData,
        owner: 'test@test.ru',
      };

      billingAgreement = await dispatch(createAgreement, data);
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

    it('Should execute an approved agreement', async () => {
      console.info('trying to approve %s', billingAgreement.url);

      const params = await approveSubscription(billingAgreement.url);
      const result = await dispatch(executeAgreement, { token: params.token });

      result.plan.payment_definitions.forEach((definition) => {
        assert.ok(definition.id);
        assert.ok(definition.name);
      });

      billingAgreement.id = result.id;
    });

    it('Should create a trial agreement', async () => {
      const data = {
        agreement: testAgreementData,
        owner: 'test@test.ru',
        trialDiscount: 10,
      };

      billingAgreement = await dispatch(createAgreement, data);
    });

    it('Should execute an approved trial agreement', async () => {
      const params = await approveSubscription(billingAgreement.url);
      const result = await dispatch(executeAgreement, { token: params.token });

      billingAgreement.id = result.id;
    });

    it('Should list all agreements', () => {
      return dispatch(listAgreement, {});
    });

    it('Should get agreement for user', async () => {
      const result = await dispatch(forUserAgreement, { user: 'test@test.ru' });

      assert.equal(result.agreement.id, billingAgreement.id);
      result.agreement.plan.payment_definitions.forEach((definition) => {
        assert.ok(definition.id);
        assert.ok(definition.name);
      });
    });

    it('Should pull updates for an agreement', async () => {
      this.timeout(duration);

      async function waitForAgreementToBecomeActive() {
        await dispatch(syncAgreements, {});

        const agreement = await dispatch(getAgreement, { id: billingAgreement.id });

        if (agreement.state.toLowerCase() === 'pending') {
          return Promise.delay(5000).then(waitForAgreementToBecomeActive);
        }

        agreement.agreement.plan.payment_definitions.forEach((definition) => {
          assert.ok(definition.id);
          assert.ok(definition.name);
        });

        return null;
      }

      return waitForAgreementToBecomeActive();
    });

    // this test is perf
    it('Should cancel agreement', () => {
      return dispatch(stateAgreement, { owner: 'test@test.ru', state: 'cancel' });
    });

    it('Should get free agreement for user after cancelling', async () => {
      const result = await dispatch(forUserAgreement, { user: 'test@test.ru' });
      assert.equal(result.id, 'free');
    });
  });
});
