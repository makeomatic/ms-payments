const CODE_UNKNOWN_SUBSCRIPTION_TOKEN = 'unknown-subscription-token';
const CODE_INVALID_SUBSCRIPTION_TOKEN = 'invalid-subscription-token';
const CODE_AGREEMENT_STATUS_FORBIDDEN = 'agreement-status-forbidden';

/**
 * Expected kind of execution error
 */
class ExecutionError extends Error {
  constructor(reason) {
    super(`Agreement execution failed. Reason: ${reason}`);
  }

  static unknownSubscriptionToken(token) {
    const error = new ExecutionError(`Unknown subscription token "${token}"`);
    error.code = CODE_UNKNOWN_SUBSCRIPTION_TOKEN;
    error.params = { token };
    return error;
  }

  static invalidSubscriptionToken(token) {
    const error = new ExecutionError(`Paypal considers token "${token}" as invalid`);
    error.code = CODE_INVALID_SUBSCRIPTION_TOKEN;
    error.params = { token };
    return error;
  }

  static agreementStatusForbidden(status) {
    const error = new ExecutionError(`Paypal agreement in state: "${status}", not "active"`);
    error.code = CODE_AGREEMENT_STATUS_FORBIDDEN;
    error.params = { status };
    return error;
  }
}

module.exports = ExecutionError;
