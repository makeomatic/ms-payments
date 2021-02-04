const CODE_AGREEMENT_STATUS_FORBIDDEN = 'agreement-status-forbidden';

class BillingNotPermittedError extends Error {
  constructor(reason) {
    super(`Billing not permitted. Reason: ${reason}`);
  }

  static forbiddenState(status) {
    const error = new BillingNotPermittedError(`Forbidden agreement status "${status}"`);
    error.code = CODE_AGREEMENT_STATUS_FORBIDDEN;
    error.params = { status };
    return error;
  }
}

module.exports = BillingNotPermittedError;
