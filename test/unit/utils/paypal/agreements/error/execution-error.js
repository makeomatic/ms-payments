const assert = require('assert');

describe('Agreement Execution Error', () => {
  const { ExecutionError } = require('../../../../../../src/utils/paypal/agreements').error;

  it('Should be able to build unknown subscription token error', () => {
    const error = ExecutionError.unknownSubscriptionToken('token-id');
    assert.strictEqual(error.code, 'unknown-subscription-token');
    assert.strictEqual(error.message, 'Agreement execution failed. Reason: Unknown subscription token "token-id"');
    assert.strictEqual(error.params.token, 'token-id');
  });

  it('Should be able to build invalid subscription token error', () => {
    const error = ExecutionError.invalidSubscriptionToken('token-id', 'test@test.ru');
    assert.strictEqual(error.code, 'invalid-subscription-token');
    assert.strictEqual(error.message, 'Agreement execution failed. Reason: Paypal considers token "token-id" as invalid');
    assert.strictEqual(error.params.token, 'token-id');
    assert.strictEqual(error.params.owner, 'test@test.ru');
  });

  it('Should be able to build agreement status forbidden error', () => {
    const error = ExecutionError.agreementStatusForbidden('agreement-id', 'cancelled', 'test@test.ru');
    assert.strictEqual(error.code, 'agreement-status-forbidden');
    assert.strictEqual(error.message, 'Agreement execution failed. Reason: Paypal agreement "agreement-id" has status: "cancelled", not "active"');
    assert.strictEqual(error.params.status, 'cancelled');
    assert.strictEqual(error.params.agreementId, 'agreement-id');
    assert.strictEqual(error.params.owner, 'test@test.ru');
  });
});
