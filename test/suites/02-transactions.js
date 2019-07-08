const Promise = require('bluebird');
const moment = require('moment');
const assert = require('assert');
const { inspectPromise } = require('@makeomatic/deploy');

describe('Transactions suite', function TransactionsSuite() {
  const { initChrome, closeChrome, approveSubscription } = require('../helpers/chrome');
  const { duration, simpleDispatcher } = require('../utils');
  const { testAgreementData, testPlanData } = require('../data/paypal');
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

  this.timeout(duration * 30);

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
    payments = new Payments();
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

    agreement = await dispatch(createAgreement, data);
  });

  before('executeAgreement', async () => {
    const parsed = await approveSubscription(agreement.url);
    agreement = await dispatch(executeAgreement, { token: parsed.token });
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

      assert.equal(error.name, 'HttpStatusError');
    });

    it('Should sync transactions', async () => {
      const start = moment().subtract(2, 'years').startOf('year').format('YYYY-MM-DD');
      const end = moment().endOf('year').format('YYYY-MM-DD');

      let state;
      do {
        // eslint-disable-next-line
        state = (await dispatch(syncTransaction, { id: agreement.id, start, end })).agreement.state;
        // eslint-disable-next-line
        if (state === 'Pending') await Promise.delay(5000);
      } while (state === 'Pending');
    });

    it('Should list all transactions', () => (
      dispatch(listTransaction, {})
    ));

    it('Should list common transactions', () => (
      dispatch(listCommonTransactions, {
        owner: userId,
        filter: {
          status: 'Completed',
        },
      })
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

      const [response] = await dispatch(transactionsAggregate, opts);
      assert.ok(response.amount);
    });
  });
});
