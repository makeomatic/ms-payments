const assert = require('assert');

describe('Billing Not Permitted Error', () => {
  const { BillingError } = require('../../../../../../src/utils/paypal/agreements').error;

  it('Should be able to build forbidden state error', () => {
    const error = BillingError.hasIncreasedPaymentFailure('agreement-id', 'test@test.ru', { local: 10, remote: 20 });
    assert.strictEqual(error.message, 'Agreement billing failed. Reason: Agreement "agreement-id" has increased failed payment count');
    assert.strictEqual(error.code, 'agreement-payment-failed');
    assert.strictEqual(error.params.agreementId, 'agreement-id');
    assert.strictEqual(error.params.owner, 'test@test.ru');
    assert.deepStrictEqual(error.params.failedCount, { local: 10, remote: 20 });
  });
});
