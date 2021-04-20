const Promise = require('bluebird');
const moment = require('moment');
const assert = require('assert');

describe('Transactions suite', function TransactionsSuite() {
  const { initChrome, closeChrome, approveSubscription } = require('../../helpers/chrome');
  const { duration, simpleDispatcher, afterAgreementExecution } = require('../../utils');
  const { testAgreementData, testPlanData } = require('../../data/paypal');
  const Payments = require('../../../src');

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
    await afterAgreementExecution(payments, dispatch, agreement, planId);
  });

  before('getAgreement', async () => {
    const result = await dispatch(getAgreement, { user: userId })
      .get('agreement');

    assert(agreement.id, result.id);
  });

  after('cleanUp', async () => {
    await dispatch(deletePlan, planId);
  });

  describe('transactions tests', () => {
    it('Should not sync transaction on invalid data', async () => {
      await assert.rejects(dispatch(syncTransaction, { wrong: 'data' }), {
        name: 'HttpStatusError',
        statusCode: 400,
        message: 'transaction.sync validation failed: data should NOT have additional properties, data should have required property \'id\'',
      });
    });

    it('Should sync transactions', async () => {
      const start = moment().startOf('day').subtract(1, 'day').format('YYYY-MM-DD');
      const end = moment().endOf('month').add(1, 'day').format('YYYY-MM-DD');

      let count = 0;
      /* eslint-disable no-await-in-loop */
      const { id: agreementId } = agreement;
      while (count === 0) {
        const { transactions } = await dispatch(syncTransaction, { id: agreement.id, start, end });
        // skip transaction with agreement id. possible sandbox bug
        count = transactions.filter((t) => t.transaction_id !== agreementId).length;
        if (count === 0) {
          payments.log.debug({ transactions }, 'Waiting for valid transactions');
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
      assert.strictEqual(transactions.page, 1);
      assert.strictEqual(transactions.pages, 1);
      assert.strictEqual(transactions.cursor, 10);

      // transaction data
      const [tx] = transactions.items;
      console.debug('==== RECEIVED TRANSACTIONS', transactions.items);
      assert.strictEqual(tx.owner, userId);
      assert.strictEqual(tx.transaction_type, 'Recurring Payment');
      assert.strictEqual(tx.agreement, agreement.id);

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
