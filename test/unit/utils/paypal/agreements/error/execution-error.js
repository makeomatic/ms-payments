const { strictEqual } = require('assert');

describe('Agreement Execution Error', () => {
  const { ExecutionError } = require('../../../../../../src/utils/paypal/agreements').error;

  it('Should be able to build unknown subscription token error', () => {
    const error = ExecutionError.unknownSubscriptionToken('token-id');
    strictEqual(error.code, 'unknown-subscription-token');
    strictEqual(error.message, 'Agreement execution failed. Reason: Unknown subscription token "token-id"');
    strictEqual(error.params.token, 'token-id');
  });

  it('Should be able to build invalid subscription token error', () => {
    const error = ExecutionError.invalidSubscriptionToken('token-id', 'test@test.ru');
    strictEqual(error.code, 'invalid-subscription-token');
    strictEqual(error.message, 'Agreement execution failed. Reason: Paypal considers token "token-id" as invalid');
    strictEqual(error.params.token, 'token-id');
    strictEqual(error.params.owner, 'test@test.ru');
  });

  it('Should be able to build agreement status forbidden error', () => {
    const error = ExecutionError.agreementStatusForbidden('agreement-id', 'token-id', 'cancelled', 'test@test.ru');
    strictEqual(error.code, 'agreement-status-forbidden');
    strictEqual(error.message, 'Agreement execution failed. Reason: Paypal agreement "agreement-id" has status: "cancelled", not "active"');
    strictEqual(error.params.status, 'cancelled');
    strictEqual(error.params.agreementId, 'agreement-id');
    strictEqual(error.params.owner, 'test@test.ru');
    strictEqual(error.params.token, 'token-id');
  });
});
