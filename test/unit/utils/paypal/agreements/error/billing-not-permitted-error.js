const assert = require('assert');

describe('Billing Not Permitted Error', () => {
  const { BillingNotPermittedError } = require('../../../../../../src/utils/paypal/agreements').error;

  it('Should be able to build forbidden state error', () => {
    const error = BillingNotPermittedError.forbiddenState('agreement-id', 'cancelled');
    assert.strictEqual(error.message, 'Billing not permitted. Reason: Agreement "agreement-id" has status "cancelled"');
    assert.strictEqual(error.code, 'agreement-status-forbidden');
    assert.strictEqual(error.params.status, 'cancelled');
    assert.strictEqual(error.params.agreementId, 'agreement-id');
  });
});
