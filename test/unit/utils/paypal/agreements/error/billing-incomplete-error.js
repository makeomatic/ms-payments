const assert = require('assert');

describe('Billing Incomplete Error', () => {
  const { BillingIncompleteError } = require('../../../../../../src/utils/paypal/agreements').error;
  it('Should just be', () => {
    const error = new BillingIncompleteError();
    // todo it's simple now, add error agreementId so it could make more sense
    assert.strictEqual(error.message, 'Billing incomplete. Agreement state is active, but there is no outstanding transactions. Please retry later.');
  });
});
