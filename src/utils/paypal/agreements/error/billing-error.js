const CODE_AGREEMENT_STATUS_FORBIDDEN = 'agreement-status-forbidden';

class BillingError extends Error {
  constructor(reason) {
    super(`Agreement billing failed. Reason: ${reason}`);
  }

  static agreementStatusForbidden(agreementId, owner, status) {
    const error = new BillingError(`Agreement "${agreementId}" has status "${status}"`);
    error.code = CODE_AGREEMENT_STATUS_FORBIDDEN;
    error.params = { agreementId, owner, status };
    return error;
  }
}

module.exports = BillingError;
