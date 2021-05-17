const Promise = require('bluebird');
const assert = require('assert');
const sinon = require('sinon');
const moment = require('moment');

const conf = require('../../../src/conf');
const { duration, simpleDispatcher, afterAgreementExecution } = require('../../utils');
const { initChrome, closeChrome, approveSubscription } = require('../../helpers/chrome');

const paypalUtils = require('../../../src/utils/paypal');

describe('Agreements suite', function AgreementSuite() {
  const sandbox = sinon.createSandbox();
  const Payments = require('../../../src');
  const {
    agreement: { cancel: billingAgreementCancel },
    handleError,
  } = paypalUtils;

  const paypalConfig = conf.get('/paypal', { env: process.env.NODE_ENV });

  const { testAgreementData, testPlanData } = require('../../data/paypal');

  const createPlan = 'payments.plan.create';
  const deletePlan = 'payments.plan.delete';
  const getAgreement = 'payments.agreement.get';
  const createAgreement = 'payments.agreement.create';
  const executeAgreement = 'payments.agreement.execute';
  const stateAgreement = 'payments.agreement.state';
  const listAgreement = 'payments.agreement.list';
  const forUserAgreement = 'payments.agreement.forUser';
  const syncAgreements = 'payments.agreement.sync';
  const billAgreement = 'payments.agreement.bill';

  let billingAgreement;
  let futureAgreement;
  let planId;
  let payments;
  let dispatch;

  this.timeout(duration * 16);

  function assertHookPublishing(publishSpy, event, payload) {
    sinon.assert.calledWithExactly(
      publishSpy,
      'payments.hook.publish',
      sinon.match({
        event,
        payload: sinon.match(payload),
      }),
      sinon.match({ confirm: true, deliveryMode: 2, mandatory: true, priority: 0 })
    );
    const hookPublishCalls = publishSpy.getCalls().filter((call) => call.firstArg === 'payments.hook.publish');
    assert.strictEqual(hookPublishCalls.length, 1);
  }

  function assertExecutionSuccessHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:execution:success', payload);
  }

  function assertExecutionFailureHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:execution:failure', payload);
  }

  function assertBillingSuccessHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:billing:success', payload);
  }

  function assertBillingFailureHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:billing:failure', payload);
  }

  function assertStateSuccessHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:state:success', payload);
  }

  before('startService', async () => {
    payments = new Payments();
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
  afterEach('reset sandbox', () => {
    sandbox.reset();
    sandbox.restore();
  });

  describe('unit tests', function UnitSuite() {
    it('Should fail to create agreement on invalid schema', async () => {
      await assert.rejects(dispatch(createAgreement, { random: true }), {
        name: 'HttpStatusError',
        statusCode: 400,
        message: 'agreement.create validation failed: data should NOT have additional properties, '
          + 'data should have required property \'owner\', data should have required property \'agreement\'',
      });
    });

    it('By default user should have free agreement', async () => {
      const result = await dispatch(forUserAgreement, { user: 'pristine@test.ru' });
      assert.strictEqual(result.id, 'free');
      assert.strictEqual(result.agreement.id, 'free');
    });

    it('Should create an agreement', async () => {
      const data = {
        agreement: testAgreementData,
        owner: 'test@test.ru',
      };

      billingAgreement = await dispatch(createAgreement, data);
    });

    it('Should create an agreement with different start_date', async () => {
      const now = Date.now();
      const startDate = moment().add(3, 'days');
      const data = {
        agreement: testAgreementData,
        owner: 'user0@test.com',
        startDate,
      };

      futureAgreement = await dispatch(createAgreement, data);
      const dateDiff = moment(futureAgreement.agreement.start_date).diff(now, 'days');

      assert.ok(dateDiff >= 31, 'agreement should start in next 31~33 days');
    });

    it('Should create an agreement with custom setupFee and discount, discount ignored', async () => {
      const data = {
        agreement: testAgreementData,
        owner: 'user0@test.com',
        setupFee: '10.00',
        trialDiscount: 10,
      };

      const { agreement } = await dispatch(createAgreement, data);
      assert.strictEqual(agreement.plan.merchant_preferences.setup_fee.value, '10');
    });

    it('Should create an agreement with custom setupFee', async () => {
      const data = {
        agreement: testAgreementData,
        owner: 'user0@test.com',
        setupFee: '0.00',
      };

      futureAgreement = await dispatch(createAgreement, data);
      assert.strictEqual(futureAgreement.agreement.plan.merchant_preferences.setup_fee.value, '0');
    });

    it('Should fail to execute on an unknown token', async () => {
      await assert.rejects(dispatch(executeAgreement, 'random token'), {
        name: 'HttpStatusError',
        statusCode: 400,
        message: 'agreement.execute validation failed: data should be object',
      });
    });

    it('Should reject unapproved agreement', async () => {
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const { token } = billingAgreement;
      await assert.rejects(dispatch(executeAgreement, { token }), {
        name: 'HttpStatusError',
        statusCode: 400,
        message: `Agreement execution failed. Reason: Paypal considers token "${token}" as invalid`,
      });
      assertExecutionFailureHookCalled(publishSpy, {
        error: sinon.match({
          message: `Agreement execution failed. Reason: Paypal considers token "${token}" as invalid`,
          code: 'invalid-subscription-token',
          params: sinon.match({ token, owner: 'test@test.ru' }),
        }),
      });
    });

    it('Should execute an approved agreement', async () => {
      const params = await approveSubscription(billingAgreement.url);
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const result = await dispatch(executeAgreement, { token: params.token });

      result.plan.payment_definitions.forEach((definition) => {
        assert.ok(definition.id);
        assert.ok(definition.name);
      });

      billingAgreement.id = result.id;
      assertExecutionSuccessHookCalled(publishSpy, {
        agreement: sinon.match({
          id: result.id,
          owner: 'test@test.ru',
          status: 'active',
          token: params.token,
        }),
      });

      await afterAgreementExecution(payments, dispatch, result, planId);
    });

    it('Should execute an future approved agreement', async () => {
      const params = await approveSubscription(futureAgreement.url);
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const result = await dispatch(executeAgreement, { token: params.token });

      result.plan.payment_definitions.forEach((definition) => {
        assert.ok(definition.id);
        assert.ok(definition.name);
      });

      futureAgreement.id = result.id;
      assertExecutionSuccessHookCalled(publishSpy, {
        agreement: sinon.match({
          id: result.id,
          owner: 'user0@test.com',
          status: 'active',
          token: params.token,
        }),
      });

      await afterAgreementExecution(payments, dispatch, result, planId);
    });

    // sorry for being verbose, will deal with it later
    it('should bill agreement', async () => {
      const { id } = billingAgreement;
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const result = await dispatch(billAgreement, { agreement: id, nextCycle: Date.now(), username: 'test@test.ru' });
      assert.strictEqual(result, 'OK');
      assertBillingSuccessHookCalled(publishSpy, {
        cyclesBilled: sinon.match.in([0, 1]),
        agreement: sinon.match({
          id,
          owner: 'test@test.ru',
          status: 'active',
        }),
      });
    });

    it('should bill agreement: send billing failed when no new cycles and failed count increased', async () => {
      const { id } = billingAgreement;
      const getAgreementStub = sandbox.stub(paypalUtils.agreement, 'get');
      getAgreementStub.resolves({
        state: 'Active',
        agreement_details: {
          failed_payment_count: 777,
        },
      });
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const dispatchStub = sandbox.stub(payments, 'dispatch');
      dispatchStub.withArgs('transaction.sync').resolves({ transactions: [] });
      dispatchStub.callThrough();

      const result = await dispatch(billAgreement, { agreement: id, nextCycle: Date.now(), username: 'test@test.ru' });
      assert.strictEqual(result, 'FAIL');
      assertBillingFailureHookCalled(publishSpy, {
        error: sinon.match({
          message: `Agreement billing failed. Reason: Agreement "${id}" has increased failed payment count`,
          code: 'agreement-payment-failed',
          params: sinon.match(
            ({ agreementId, owner }) => (agreementId === id && owner === 'test@test.ru')
          ),
        }),
      });
    });

    it('should bill agreement: send billing success when new cycles billed and failed count increased', async () => {
      const { id } = billingAgreement;
      const getAgreementStub = sandbox.stub(paypalUtils.agreement, 'get');
      getAgreementStub.resolves({
        state: 'Active',
        agreement_details: {
          failed_payment_count: 1,
          cycles_completed: 3,
        },
      });
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const dispatchStub = sandbox.stub(payments, 'dispatch');
      dispatchStub.withArgs('transaction.sync').resolves({ transactions: [] });
      dispatchStub.callThrough();

      const result = await dispatch(billAgreement, { agreement: id, nextCycle: moment().subtract(1, 'day').valueOf(), username: 'test@test.ru' });

      assert.strictEqual(result, 'OK');
      assertBillingSuccessHookCalled(publishSpy, {
        cyclesBilled: 3,
        agreement: {
          id,
          owner: 'test@test.ru',
          status: 'active',
        },
      });
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
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const result = await dispatch(executeAgreement, { token: params.token });

      billingAgreement.id = result.id;

      assertExecutionSuccessHookCalled(publishSpy, {
        agreement: sinon.match({
          id: result.id,
          owner: 'test@test.ru',
          status: 'active',
          token: params.token,
        }),
      });

      await afterAgreementExecution(payments, dispatch, result, planId);
    });

    it('Should get agreement for user', async () => {
      const result = await dispatch(forUserAgreement, { user: 'test@test.ru' });

      assert.strictEqual(result.agreement.id, billingAgreement.id);
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
    it('Should cancel agreement', async () => {
      const { id } = billingAgreement;
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      await dispatch(stateAgreement, { agreement: id, owner: 'test@test.ru', state: 'cancel' });
      assertStateSuccessHookCalled(publishSpy, {
        agreement: sinon.match({
          id,
          owner: 'test@test.ru',
          status: 'cancelled',
        }),
      });
    });

    // sorry for being verbose, will deal with it later
    it('should fail when billing is not permitted', async () => {
      const { id } = billingAgreement;
      const publishSpy = sandbox.spy(payments.amqp, 'publish');

      const result = await dispatch(billAgreement, { agreement: id, nextCycle: Date.now(), username: 'test@test.ru' });
      assert.strictEqual(result, 'FAIL');
      assertBillingFailureHookCalled(publishSpy, {
        error: sinon.match({
          message: `Agreement billing failed. Reason: Agreement "${id}" has status "cancelled"`,
          code: 'agreement-status-forbidden',
          params: sinon.match({ status: 'cancelled', agreementId: id, owner: 'test@test.ru' }),
        }),
      });
    });

    it('Should create and execute an agreement for a case when statuses for Paypal and Redis are different', async () => {
      const data = {
        agreement: {
          ...testAgreementData,
          description: 'Redis and Paypal',
        },
        owner: 'test@test.ru',
        trialDiscount: 20,
      };

      billingAgreement = await dispatch(createAgreement, data);

      const params = await approveSubscription(billingAgreement.url);
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const result = await dispatch(executeAgreement, { token: params.token });

      billingAgreement.id = result.id;

      assertExecutionSuccessHookCalled(publishSpy, {
        agreement: sinon.match({
          id: result.id,
          owner: 'test@test.ru',
          status: 'active',
          token: params.token,
        }),
      });

      await afterAgreementExecution(payments, dispatch, result, planId);
    });

    it('Should pull updates for an agreement for a case when statuses for Paypal and Redis are different', async () => {
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

      return waitForAgreementToBecomeActive(); // the billing agreement in Redis and Paypal is ACTIVE
    });

    it('should deactivate agreement on Paypal only', async () => {
      await billingAgreementCancel(billingAgreement.id, { note: 'Canceled for testing scenario' }, paypalConfig)
        .catch(handleError)
        .then((result) => {
          assert.deepStrictEqual(result, { httpStatusCode: 204 }); // the same billing agreement in Paypal is CANCELLED
          return null;
        });
    });

    it('Should cancel the agreement with unsynchronized statuses', async () => {
      const { id } = billingAgreement;
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      await dispatch(stateAgreement, { agreement: id, owner: 'test@test.ru', state: 'cancel' });
      assertStateSuccessHookCalled(publishSpy, {
        agreement: sinon.match({
          id,
          owner: 'test@test.ru',
          status: 'cancelled',
        }),
      });
    });

    it('Should list all agreements', () => {
      return dispatch(listAgreement, {});
    });
  });
});
