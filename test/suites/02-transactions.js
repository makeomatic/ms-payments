const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const url = require('url');
const { init, clean, captureScreenshot, type, submit, wait, captureRedirect, scrollTo } = require('@makeomatic/deploy/bin/chrome');
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
  before('launch chrome', init);
  after('clean chrome', clean);

  function approve(saleUrl) {
    const { Page } = this.protocol;

    Page.navigate({ url: saleUrl });

    return Page.loadEventFired().then(() => (
      // sometimes input is flaky, how do we determine that everything has loaded?
      Promise
        .bind(this, '#loadLogin, #login_email')
        .tap(wait)
        .return([0, 0])
        .spread(scrollTo)
        .return('#loadLogin, #login_email')
        .then(submit)
        .return(['#login_email', 'test@cappasity.com'])
        .spread(type)
        .return(['#login_password', '12345678'])
        .spread(type)
        .return('#submitLogin')
        .then(submit)
        .return('#continue')
        .then(wait)
        .return('#continue')
        .then(submit)
        .return(/paypal-subscription-return\?/)
        .then(captureRedirect)
        .catch(captureScreenshot)
        .then((response) => {
          // actual test verification goes on here
          const data = url.parse(response, true).query;
          return {
            payer_id: data.PayerID,
            payment_id: data.paymentId,
            token: data.token,
          };
        })
    ));
  }

  before(() => {
    payments = new Payments(TEST_CONFIG);
    return payments.connect();
  });

  before('initPlan', () => {
    dispatch = simpleDispatcher(payments);
    return dispatch(createPlan, testPlanData).then((data) => {
      const id = data.plan.id.split('|')[0];
      testAgreementData.plan.id = id;
      planId = data.plan.id;
      return null;
    });
  });

  before('get user id', () => {
    const { config } = payments;
    const route = `${config.users.prefix}.${config.users.postfix.getInternalData}`;

    return dispatch(route, { username: 'test@test.ru', fields: ['id'] })
      .then(({ id }) => {
        userId = id;
        return null;
      });
  });

  before('createAgreement', () => {
    const data = {
      agreement: testAgreementData,
      owner: userId,
    };

    return dispatch(createAgreement, data)
      .reflect()
      .then(inspectPromise())
      .then((result) => {
        agreement = result;
        return null;
      });
  });

  before('executeAgreement', function test() {
    return approve.call(this, agreement.url).then(parsed => (
      dispatch(executeAgreement, { token: parsed.token })
        .reflect()
        .then(inspectPromise())
        .then((result) => {
          agreement = result;
          return null;
        })
    ));
  });

  before('getAgreement', () => (
    dispatch(getAgreement, { user: userId })
      .get('agreement')
      .then((result) => {
        assert(agreement.id, result.id);
        return null;
      })
  ));

  after('cleanUp', () => dispatch(deletePlan, planId).reflect());

  describe('transactions tests', () => {
    it('Should not sync transaction on invalid data', () => (
      dispatch(syncTransaction, { wrong: 'data' })
        .reflect()
        .then((result) => {
          assert(result.isRejected());
          assert.equal(result.reason().name, 'ValidationError');
          return null;
        })
    ));

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

    it('should return aggregate list of transactions', () => (
      dispatch(transactionsAggregate, {
        owners: [userId],
        filter: {
          status: 'Completed',
        },
        aggregate: {
          amount: 'sum',
        },
      })
        .reflect()
        .then(inspectPromise())
        .then((response) => {
          assert.ok(response[0].amount);
          return null;
        })
    ));
  });
});
