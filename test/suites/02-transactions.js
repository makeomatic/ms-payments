const TEST_CONFIG = require('../config');
const assert = require('assert');
const { initChrome, closeChrome, approveSubscription } = require('../helpers/chrome');
const { inspectPromise } = require('@makeomatic/deploy');
const { duration, simpleDispatcher } = require('../utils');
const { testAgreementData, testPlanData } = require('../data/paypal');

describe('Transactions suite', function TransactionsSuite() {
  const Payments = require('../../src');

  const syncTransaction = 'payments.transaction.sync';
  const listTransaction = 'payments.transaction.list';
  const getAgreement = 'payments.agreement.forUser';
  const createPlan = 'payments.plan.create';
  const deletePlan = 'payments.plan.delete';
  const createAgreement = 'payments.agreement.create';
  const executeAgreement = 'payments.agreement.execute';
  const transactionsAggregate = 'payments.transaction.aggregate';
  const listCommonTransactions = 'payments.transaction.common';

  this.timeout(duration * 4);

  let payments;
  let agreement;
  let planId;
  let dispatch;
  let userId;

  // headless testing
  // need to relaunch each time for clean contexts
  before('init Chrome', initChrome);
  after('close chrome', closeChrome);

  before(async () => {
    payments = new Payments(TEST_CONFIG);
    await payments.connect();
    dispatch = simpleDispatcher(payments);
  });

  before('initPlan', async () => {
    const data = await dispatch(createPlan, testPlanData);
    const id = data.plan.id.split('|')[0];
    testAgreementData.plan.id = id;
    planId = data.plan.id;
  });

  before('get user id', async () => {
    const { config } = payments;
    const route = `${config.users.prefix}.${config.users.postfix.getInternalData}`;
    const { id } = await dispatch(route, { username: 'test@test.ru', fields: ['id'] });
    userId = id;
  });

  before('createAgreement', async () => {
    const data = {
      agreement: testAgreementData,
      owner: userId,
    };

    agreement = await dispatch(createAgreement, data)
      .reflect()
      .then(inspectPromise());
  });

  before('executeAgreement', async () => {
    const parsed = await approveSubscription(agreement.url);
    agreement = await dispatch(executeAgreement, { token: parsed.token })
      .reflect()
      .then(inspectPromise());
  });

  before('getAgreement', async () => {
    const result = await dispatch(getAgreement, { user: userId })
      .get('agreement');

    assert(agreement.id, result.id);
  });

  after('cleanUp', () => dispatch(deletePlan, planId).reflect());

  describe('transactions tests', () => {
    it('Should not sync transaction on invalid data', async () => {
      const error = await dispatch(syncTransaction, { wrong: 'data' })
        .reflect()
        .then(inspectPromise(false));

      assert.equal(error.name, 'ValidationError');
    });

    it('Should sync transactions', () => {
      const start = '2015-01-01';
      const end = '2016-12-31';
      return dispatch(syncTransaction, { id: agreement.id, start, end })
        .reflect()
        .then(inspectPromise());
    });

    it('Should list all transactions', () => (
      dispatch(listTransaction, {})
        .reflect()
        .then(inspectPromise())
    ));

    it('Should list common transactions', () => (
      dispatch(listCommonTransactions, {
        owner: userId,
        filter: {
          status: 'Completed',
        },
      })
        .reflect()
        .then(inspectPromise())
    ));

    it('should return aggregate list of transactions', async () => {
      const opts = {
        owners: [userId],
        filter: {
          status: 'Completed',
        },
        aggregate: {
          amount: 'sum',
        },
      };

      const [response] = await dispatch(transactionsAggregate, opts)
        .reflect()
        .then(inspectPromise());

      assert.ok(response.amount);
    });
  });
});
