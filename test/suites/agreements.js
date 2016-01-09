/* global TEST_CONFIG */
const { expect } = require('chai');
const Promise = require('bluebird');

function debug(result) {
  if (result.isRejected()) {
    const err = result.reason();
    process.stdout.write(require('util').inspect(err, { depth: 5 }) + '\n');
    process.stdout.write(err && err.stack || err);
    process.stdout.write(err && err.response || '');
  }
}

describe('Agreements suite', function UserClassSuite() {
  const Payments = require('../../src');

  // mock paypal requests
  // require('../mocks/paypal');
  const { billingAgreementAttributes } = require('../data/paypal');

  this.timeout(20000);

  describe('unit tests', function UnitSuite() {
    const createAgreementHeaders = { routingKey: 'payments.agreement.create' };
    const executeAgreementHeaders = { routingKey: 'payments.agreement.execute' };

    let payments;
    let billingAgreement;

    before(function startService() {
      payments = new Payments(TEST_CONFIG);
      return payments.connect()
        .then(function stub() {
          payments._amqp = {
            publishAndWait: () => {
              return Promise.resolve(true);
            },
          };
        });
    });

    it('Should fail to create agreement on invalid schema', () => {
      return payments.router({ random: true }, createAgreementHeaders)
        .reflect()
        .then((result) => {
          expect(result.isRejected()).to.be.eq(true);
          expect(result.reason().name).to.be.eq('ValidationError');
        });
    });

    it('Should create an agreement', () => {
      const data = {
        agreement: billingAgreementAttributes,
        owner: 'test@test.com',
      };

      return payments.router(data, createAgreementHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          expect(result.isFulfilled()).to.be.eq(true);
          billingAgreement = result.value();
        });
    });

    it('Should fail to execute on an unknown token', () => {
      return payments.router('random token', executeAgreementHeaders)
        .reflect()
        .then((result) => {
          expect(result.isRejected()).to.be.eq(true);
        });
    });

    it('Should reject unapproved agreement', () => {
      return payments.router(billingAgreement.token + '-UNAPPROVED', executeAgreementHeaders)
        .reflect()
        .then((result) => {
          expect(result.isRejected()).to.be.eq(true);
        });
    });

    it('Should execute an approved agreement', () => {
      return payments.router(billingAgreement.token, executeAgreementHeaders)
        .reflect()
        .then((result) => {
          debug(result);
          expect(result.isFulfilled()).to.be.eq(true);
        });
    });
  });
});
