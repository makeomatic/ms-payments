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
});
