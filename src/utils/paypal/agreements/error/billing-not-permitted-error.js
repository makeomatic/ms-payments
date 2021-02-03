const CODE_AGREEMENT_STATE_FORBIDDEN = 'agreement-state-forbidden';

class BillingNotPermittedError extends Error {
  constructor(reason) {
    super(`Billing not permitted. Reason: ${reason}`);
  }

  static forbiddenState(state) {
    const error = new BillingNotPermittedError(`Forbidden agreement state "${state}"`);
    error.code = CODE_AGREEMENT_STATE_FORBIDDEN;
    error.meta = { state };
    return error;
  }
}

module.exports = BillingNotPermittedError;
