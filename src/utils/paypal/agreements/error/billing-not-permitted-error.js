const CODE_AGREEMENT_STATUS_FORBIDDEN = 'agreement-status-forbidden';

class BillingNotPermittedError extends Error {
  constructor(reason) {
    super(`Billing not permitted. Reason: ${reason}`);
  }

  static forbiddenState(agreementId, status) {
    const error = new BillingNotPermittedError(`Agreement "${agreementId}" has status "${status}"`);
    error.code = CODE_AGREEMENT_STATUS_FORBIDDEN;
    error.params = { agreementId, status };
    return error;
  }
}

module.exports = BillingNotPermittedError;
