const CODE_AGREEMENT_STATUS_FORBIDDEN = 'agreement-status-forbidden';
const CODE_AGREEMENT_PAYMENT_FAILED = 'agreement-payment-failed';

class BillingError extends Error {
  constructor(reason) {
    super(`Agreement billing failed. Reason: ${reason}`);
  }

  getHookErrorData() {
    return {
      message: this.message,
      code: this.code,
      params: this.params,
    };
  }

  static agreementStatusForbidden(agreementId, owner, status) {
    const error = new BillingError(`Agreement "${agreementId}" has status "${status}"`);
    error.code = CODE_AGREEMENT_STATUS_FORBIDDEN;
    error.params = { agreementId, owner, status };
    return error;
  }

  static hasIncreasedPaymentFailure(agreementId, owner, failedCount) {
    const error = new BillingError(`Agreement "${agreementId}" has increased failed payment count`);
    error.code = CODE_AGREEMENT_PAYMENT_FAILED;
    error.params = { agreementId, owner, failedCount };
    return error;
  }
}

module.exports = BillingError;
