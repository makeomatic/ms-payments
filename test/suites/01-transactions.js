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
  const syncUpdatedTx = 'payments.transaction.sync-updated';

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
      const start = moment().startOf('day').subtract(1, 'day').format('YYYY-MM-DD');
      const end = moment().endOf('month').add(1, 'day').format('YYYY-MM-DD');

      let state = 'Pending';
      /* eslint-disable no-await-in-loop */
      while (state === 'Pending') {
        const { agreement: aggr, transactions } = await dispatch(syncTransaction, { id: agreement.id, start, end });
        state = aggr.state;
        if (state === 'Pending' || transactions.length === 0) {
          state = 'Pending';
          await Promise.delay(5000);
        }
      }
      /* eslint-enable no-await-in-loop */
    });

    it('Should list all transactions', async () => {
      const transactions = await dispatch(listTransaction, {});

      // common props
      // could be 1 -- updating or 2 - completed + created or 2 updated ))))
      assert(transactions.items.length > 0 && transactions.items.length <= 2, `Got 0 < ${transactions.items.length} <= 2`);
      assert.equal(transactions.page, 1);
      assert.equal(transactions.pages, 1);
      assert.equal(transactions.cursor, 10);

      // transaction data
      const [tx] = transactions.items;

      assert.equal(tx.owner, userId);
      assert.equal(tx.transaction_type, 'Recurring Payment');
      assert.equal(tx.agreement, agreement.id);

      // we are done in this case
      if (tx.status === 'Completed') {
        return;
      }

      let syncedTx = 0;
      while (syncedTx === 0) {
        // eslint-disable-next-line no-await-in-loop
        syncedTx = await dispatch(syncUpdatedTx, {});
        if (syncedTx === 0) {
          payments.log.debug({ syncedTx }, 'waiting for transaction status update');
          // eslint-disable-next-line no-await-in-loop
          await Promise.delay(500);
        }
      }
    });

    it('Should list common transactions', () => (
      dispatch(listCommonTransactions, {
        owner: userId,
        filter: {
          status: {
            any: ['Completed'],
          },
        },
      })
    ));

    it('should return aggregate list of transactions', async () => {
      const opts = {
        owners: [userId],
        filter: {
          status: {
            any: ['Completed'],
          },
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
