const assert = require('assert');

describe('Execution Incomplete Error', () => {
  const { ExecutionIncompleteError } = require('../../../../../../src/utils/paypal/agreements').error;

  it('Should be able to build error with attempts count', () => {
    const error = ExecutionIncompleteError.noTransactionsAfter('agreement-id', 3);
    assert.strictEqual(
      error.message,
      'Execution incomplete. Reason: Agreement "agreement-id" has been executed, but there is no sufficient transactions after 3 attempts'
    );
    assert.strictEqual(error.params.attemptsCount, 3);
  });
});
