const TEST_CONFIG = require('../config');
const Promise = require('bluebird');
const assert = require('assert');
const url = require('url');
const Nightmare = require('nightmare');
const { inspectPromise } = require('@makeomatic/deploy');
const { debug, duration, simpleDispatcher } = require('../utils');
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

  function approve(saleUrl) {
    const browser = new Nightmare({
      waitTimeout: 15000,
      electronPath: require('electron'),
      webPreferences: {
        preload: '/src/test/data/preload.js',
      },
    });

    return new Promise((resolve, reject) => {
      const _debug = require('debug')('nightmare');

      function parseURL(newUrl) {
        if (newUrl.indexOf('cappasity') >= 0) {
          const parsed = url.parse(newUrl, true);
          const data = {
            payer_id: parsed.query.PayerID,
            payment_id: parsed.query.paymentId,
            token: parsed.query.token,
          };

          _debug('resolved data', data);
          resolve(data);
        }
      }

      browser
        .on('did-get-redirect-request', (events, oldUrl, newUrl) => {
          _debug('redirect to %s', newUrl);
          parseURL(newUrl);
        })
        .on('did-get-response-details', (event, status, newUrl) => {
          _debug('response from %s', newUrl);
          parseURL(newUrl);
        })
        .on('will-navigate', (event, newUrl) => {
          _debug('navigate to %s', newUrl);
          parseURL(newUrl);
        })
        .goto(saleUrl)
        .screenshot('./ss/pre-email.png')
        .wait('#loadLogin, #login_email')
        .click('#loadLogin, #login_email')
        .wait('#login_email')
        .type('#login_email', false)
        .wait(3000)
        .type('#login_email', 'test@cappasity.com')
        .type('#login_password', '12345678')
        .wait(3000)
        .screenshot('./ss/after-email.png')
        .click('#submitLogin')
        .screenshot('./ss/right-after-submit.png')
        .wait(3000)
        .screenshot('./ss/after-submit.png')
        .wait('#continue')
        .screenshot('./ss/pre-confirm.png')
        .click('#continue')
        .screenshot('./ss/right-after-confirm.png')
        .wait(3000)
        .screenshot('./ss/after-confirm.png')
        .end()
        .then(() => _debug('finished running'))
        .catch((err) => {
          _debug('failed with error', err);
          reject(err);
        });
    });
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
      .then(({ id }) => (userId = id));
  });

  before('createAgreement', () => {
    const data = {
      agreement: testAgreementData,
      owner: userId,
    };

    return dispatch(createAgreement, data)
      .reflect()
      .then((result) => {
        debug(result);
        assert(result.isFulfilled());
        agreement = result.value();
        return null;
      });
  });

  before('executeAgreement', () => (
    approve(agreement.url)
      .then(parsed => (
        dispatch(executeAgreement, { token: parsed.token })
          .reflect()
          .then((result) => {
            debug(result);
            assert(result.isFulfilled());
            agreement = result.value();
            return null;
          })
      ))
  ));

  before('getAgreement', () => (
    dispatch(getAgreement, { user: userId })
      .get('agreement')
      .then((result) => {
        assert(agreement.id, result.id);
        return null;
      })
  ));

  after('cleanUp', () => dispatch(deletePlan, planId).reflect());

  describe('unit tests', () => {
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
        .then((result) => {
          debug(result);
          assert(result.isFulfilled());
          return null;
        });
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
