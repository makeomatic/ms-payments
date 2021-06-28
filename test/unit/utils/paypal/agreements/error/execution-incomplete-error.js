const assert = require('assert');

describe('Execution Incomplete Error', () => {
  const { ExecutionIncompleteError } = require('../../../../../../src/utils/paypal/agreements').error;

  it('Should be able to build error with attempts count', () => {
    const error = ExecutionIncompleteError.noTransaction('agreement-id', 'test@test.ru', 'task-id');
    assert.strictEqual(
      error.message,
      'Execution incomplete. Reason: Agreement "agreement-id" has been executed, but there is no sufficient transactions'
    );
    assert.strictEqual(error.params.creatorTaskId, 'task-id');
    assert.strictEqual(error.params.agreementId, 'agreement-id');
    assert.strictEqual(error.params.owner, 'test@test.ru');
  });
});
