const assert = require('assert');

describe('Billing Not Permitted Error', () => {
  const { BillingError } = require('../../../../../../src/utils/paypal/agreements').error;

  it('Should be able to build forbidden state error', () => {
    const error = BillingError.agreementStatusForbidden('agreement-id', 'test@test.ru', 'cancelled');
    assert.strictEqual(error.message, 'Agreement billing failed. Reason: Agreement "agreement-id" has status "cancelled"');
    assert.strictEqual(error.code, 'agreement-status-forbidden');
    assert.strictEqual(error.params.status, 'cancelled');
    assert.strictEqual(error.params.agreementId, 'agreement-id');
    assert.strictEqual(error.params.owner, 'test@test.ru');
  });
});
