const Promise = require('bluebird');
const assert = require('assert');
const { inspectPromise } = require('@makeomatic/deploy');
const { simpleDispatcher } = require('../utils');
const { routesPaypal: {
  createPlan,
  deletePlan,
  getAgreement,
  createAgreement,
  executeAgreement,
  stateAgreement,
  listAgreement,
  forUserAgreement,
  syncAgreements,
} } = require('../helpers/paypal');
const { initChrome, closeChrome, approveSubscription } = require('../helpers/chrome');
const Payments = require('../../src');
const { testAgreementData, testPlanData } = require('../data/paypal');
const {
  agreement: {
    cancel: billingAgreementCancel,
  },
  handleError,
} = require('../../src/utils/paypal');
const conf = require('../../src/conf');

const paypalConfig = conf.get('/paypal', { env: process.env.NODE_ENV });


describe('Agreements suite', function AgreementsSuite() {
  let dispatch;
  let planId;
  let agreementParams;
  let trialAgreementParams;
  let unsynchronizedAgreementParams;

  this.timeout(900000);

  before('start service', async () => {
    const payments = new Payments();
    await payments.connect();
    dispatch = simpleDispatcher(payments);
  });

  before('init plan', async () => {
    const data = await dispatch(createPlan, testPlanData);
    const id = data.plan.id.split('|')[0];
    planId = data.plan.id;

    testAgreementData.plan.id = id;
  });

  before('init testing agreements params', async () => {
    agreementParams = {
      owner: 'test@test.ru',
      agreement: testAgreementData,
    };

    trialAgreementParams = {
      owner: 'test@test.ru',
      agreement: {
        ...testAgreementData,
        description: 'Trial agreement',
      },
      trialDiscount: 10,
    };

    unsynchronizedAgreementParams = {
      owner: 'test@test.ru',
      agreement: {
        ...testAgreementData,
        description: 'Redis and Paypal',
      },
      trialDiscount: 20,
    };
  });

  beforeEach('init Chrome', initChrome);

  after(() => {
    return dispatch(deletePlan, planId).reflect();
  });

  afterEach('close chrome', closeChrome);

  async function getNewAgreement(params) {
    return dispatch(createAgreement, params);
  }

  async function pullUpdatesForAgreement(agreementId) {
    async function waitForAgreementToBecomeActive() {
      await dispatch(syncAgreements, {});

      const agreement = await dispatch(getAgreement, { id: agreementId });

      if (agreement.state.toLowerCase() === 'pending') {
        return Promise.delay(5000).then(await waitForAgreementToBecomeActive);
      }

      agreement.agreement.plan.payment_definitions.forEach((definition) => {
        assert.ok(definition.id);
        assert.ok(definition.name);
      });

      return null;
    }

    return waitForAgreementToBecomeActive();
  }

  async function executeApprovedAgreement(token) {
    return dispatch(executeAgreement, { token });
  }


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

  it('Should fail to execute on an unknown token', () => {
    return dispatch(executeAgreement, 'random token')
      .reflect()
      .then(inspectPromise(false));
  });

  it('Should reject unapproved agreement', async () => {
    const agreement = await getNewAgreement(agreementParams);
    return dispatch(executeAgreement, { token: agreement.token })
      .reflect()
      .then(inspectPromise(false));
  });

  it('Should approve and execute a free agreement', async () => {
    const agreement = await getNewAgreement(agreementParams);

    console.info('trying to approve %s', agreement.url);
    const approvedSubscription = await approveSubscription(agreement.url);
    const executedAgreement = await executeApprovedAgreement(approvedSubscription.token);

    executedAgreement.plan.payment_definitions.forEach((definition) => {
      assert.ok(definition.id);
      assert.ok(definition.name);
    });
  });

  it('Should fetch from Redis executed trial agreement for user', async () => {
    const trialAgreement = await getNewAgreement(trialAgreementParams);
    const trialAgreementApproved = await approveSubscription(trialAgreement.url);
    const trialAgreementExecuted = await executeApprovedAgreement(trialAgreementApproved.token);
    const trialAgreementFromRedis = await dispatch(forUserAgreement, { user: 'test@test.ru' });

    assert.equal(trialAgreement.agreement.description, 'Trial agreement');
    assert.equal(trialAgreementFromRedis.agreement.id, trialAgreementExecuted.id);
    trialAgreementFromRedis.agreement.plan.payment_definitions.forEach((definition) => {
      assert.ok(definition.id);
      assert.ok(definition.name);
    });
  });

  it('Should get free agreement for user after cancelling trial agreement', async () => {
    const trialAgreement = await getNewAgreement(trialAgreementParams);
    const trialAgreementApproved = await approveSubscription(trialAgreement.url);
    const trialAgreementExecuted = await executeApprovedAgreement(trialAgreementApproved.token);
    await pullUpdatesForAgreement(trialAgreementExecuted.id);
    await dispatch(stateAgreement, { owner: 'test@test.ru', state: 'cancel' });
    const agreementAfterCancel = await dispatch(forUserAgreement, { user: 'test@test.ru' });

    assert.equal(agreementAfterCancel.id, 'free');
  });

  it('Should handle an agreement for a case when statuses for Paypal and Redis are get unsynchronized', async () => {
    const unsynchronizedAgreement = await getNewAgreement(unsynchronizedAgreementParams);
    const unsynchronizedAgreementApproved = await approveSubscription(unsynchronizedAgreement.url);
    const unsynchronizedAgreementExecuted = await executeApprovedAgreement(unsynchronizedAgreementApproved.token);
    await pullUpdatesForAgreement(unsynchronizedAgreementExecuted.id); // the billing agreement in Redis and Paypal have ACTIVE status
    await billingAgreementCancel(unsynchronizedAgreementExecuted.id, { note: 'Canceled for testing scenario' }, paypalConfig)
      .then((response) => {
        assert.deepStrictEqual(response, { httpStatusCode: 204 }); // the same billing agreement in Paypal have CANCELLED status
        return null;
      })
      .catch(handleError);
    await dispatch(stateAgreement, { owner: 'test@test.ru', state: 'cancel' }); // Cancel the agreement with unsynchronized status
    const agreementAfterCancel = await dispatch(forUserAgreement, { user: 'test@test.ru' });

    assert.equal(agreementAfterCancel.id, 'free');

    // get from Paypal a list of all agreements
    const agreements = await dispatch(listAgreement, {});
    console.info('\nagreements list from paypal:\n', JSON.stringify(agreements));

    const unsynchronizedAgreementId = (item) => item.agreement.id === unsynchronizedAgreementExecuted.id;
    assert.ok(agreements.items.some(unsynchronizedAgreementId));

    const unsynchronizedAgreementToken = (item) => item.token === unsynchronizedAgreementApproved.token;
    assert.ok(agreements.items.some(unsynchronizedAgreementToken));
  });
});
