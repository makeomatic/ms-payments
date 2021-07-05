const Promise = require('bluebird');
const assert = require('assert');
const sinon = require('sinon');
const moment = require('moment');

const conf = require('../../../src/conf');
const { duration, simpleDispatcher, afterAgreementExecution } = require('../../utils');
const { initChrome, closeChrome, approveSubscription } = require('../../helpers/chrome');

const paypalUtils = require('../../../src/utils/paypal');
const { PAYPAL_DATE_FORMAT } = require('../../../src/constants');

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
  const finalizeExecution = 'payments.agreement.finalize-execution';
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
  }

  function assertExecutionSuccessHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:execution:success', payload);
  }

  function assertExecutionFailureHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:execution:failure', payload);
  }

  function assertFinalizationSuccessHookCalled(publishSpy, payload) {
    assertHookPublishing(publishSpy, 'paypal:agreements:finalization:success', payload);
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
        creatorTaskId: 'fake-task-id',
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

    it('Should create an agreement without setup fee and use passed startDate without changes', async () => {
      const now = moment().add(1, 'month');
      const data = {
        agreement: testAgreementData,
        owner: 'user0@test.com',
        setupFee: '24.99',
        trialDiscount: 0,
        startDate: now,
        skipSetupFee: true,
      };

      const { agreement } = await dispatch(createAgreement, data);

      assert.strictEqual(agreement.plan.merchant_preferences.setup_fee.value, '0');
      assert.strictEqual(
        moment(agreement.start_date).format(PAYPAL_DATE_FORMAT),
        now.format(PAYPAL_DATE_FORMAT)
      );
    });

    it('Should create an agreement with BillingcreatorTaskId', async () => {
      const now = moment().add(1, 'month');
      const data = {
        agreement: testAgreementData,
        owner: 'user0@test.com',
        trialDiscount: 0,
        startDate: now,
        creatorTaskId: 'some-weird-id',
      };

      const result = await dispatch(createAgreement, data);

      assert.strictEqual(result.creatorTaskId, 'some-weird-id');
    });

    it('Should create an agreement with custom setupFee', async () => {
      const data = {
        agreement: testAgreementData,
        owner: 'user0@test.com',
        setupFee: '0.00',
        creatorTaskId: 'future-agreement-task-id',
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
        creatorTaskId: 'fake-task-id',
      });

      await afterAgreementExecution(payments, dispatch, result, planId);
    });

    it('Should pull updates for an agreement', async () => {
      this.timeout(duration);
      const publishSpy = sandbox.spy(payments.amqp, 'publish');

      async function waitForAgreementToBecomeActive(attempts) {
        const finalizationResult = await dispatch(finalizeExecution, { agreementId: billingAgreement.id });
        const agreement = await dispatch(getAgreement, { id: billingAgreement.id });

        // NOTE: transaction count is 2 because of transaction with agreement id and other transaction
        if (finalizationResult.agreement.status.toLowerCase() === 'pending' || !finalizationResult.agreementFinalized) {
          // Takes too long to finalize
          if (attempts > 50) {
            payments.log.error('Unable to finalize agreement!');
            return null;
          }
          return Promise.delay(5000).then(() => waitForAgreementToBecomeActive(attempts + 1));
        }

        assertFinalizationSuccessHookCalled(publishSpy, {
          agreement: sinon.match({
            id: billingAgreement.id,
            owner: 'test@test.ru',
            status: 'active',
            token: billingAgreement.token,
          }),
          agreementFinalized: true,
          creatorTaskId: 'fake-task-id',
          transactionRequired: true,
          transaction: sinon.match.object,
        });

        agreement.agreement.plan.payment_definitions.forEach((definition) => {
          assert.ok(definition.id);
          assert.ok(definition.name);
        });

        return null;
      }

      return waitForAgreementToBecomeActive(0);
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
        creatorTaskId: 'future-agreement-task-id',
      });

      await afterAgreementExecution(payments, dispatch, result, planId);
    });

    it('Should pull updates for an agreement without setup fee', async () => {
      this.timeout(duration);
      const publishSpy = sandbox.spy(payments.amqp, 'publish');

      async function waitForAgreementToBecomeActive(attempts) {
        const finalizationResult = await dispatch(finalizeExecution, { agreementId: futureAgreement.id });
        const agreement = await dispatch(getAgreement, { id: futureAgreement.id });

        if (finalizationResult.agreement.status.toLowerCase() === 'pending' || !finalizationResult.agreementFinalized) {
          // Takes too long to finalize
          if (attempts > 50) {
            payments.log.error('Unable to finalize agreement!');
            return null;
          }
          return Promise.delay(5000).then(() => waitForAgreementToBecomeActive(attempts + 1));
        }

        assertFinalizationSuccessHookCalled(publishSpy, {
          agreement: sinon.match({
            id: futureAgreement.id,
            owner: 'user0@test.com',
            status: 'active',
            token: futureAgreement.token,
          }),
          creatorTaskId: 'future-agreement-task-id',
          agreementFinalized: true,
          transactionRequired: false,
        });

        agreement.agreement.plan.payment_definitions.forEach((definition) => {
          assert.ok(definition.id);
          assert.ok(definition.name);
        });

        return null;
      }

      return waitForAgreementToBecomeActive(0);
    });

    // sorry for being verbose, will deal with it later
    it('should bill agreement', async () => {
      const { id } = billingAgreement;
      const publishSpy = sandbox.spy(payments.amqp, 'publish');
      const result = await dispatch(billAgreement, { agreement: id, subscriptionInterval: 'month', username: 'test@test.ru' });
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

      const result = await dispatch(billAgreement, { agreement: id, subscriptionInterval: 'month', username: 'test@test.ru' });
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

    it('should bill agreement: send billing failure when new cycles billed and failed count increased', async () => {
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
          message: `Agreement "${id}" has status "cancelled"`,
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
      const result = await dispatch(executeAgreement, { token: params.token });

      billingAgreement.id = result.id;

      await afterAgreementExecution(payments, dispatch, result, planId);
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
      const agreement = await dispatch(getAgreement, { id });
      assertStateSuccessHookCalled(publishSpy, {
        agreement: sinon.match({
          id,
          owner: 'test@test.ru',
          status: 'cancelled',
        }),
      });

      console.debug('=== UPDATED', agreement);
    });

    it('Should list all agreements', () => {
      return dispatch(listAgreement, {});
    });
  });
});
