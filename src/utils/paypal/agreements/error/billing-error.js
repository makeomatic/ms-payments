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

  static hasIncreasedPaymentFailure(agreementId, owner, failedCount) {
    const error = new BillingError(`Agreement "${agreementId}" has increased failed payment count`);
    error.code = CODE_AGREEMENT_PAYMENT_FAILED;
    error.params = { agreementId, owner, failedCount };
    return error;
  }
}

module.exports = BillingError;
