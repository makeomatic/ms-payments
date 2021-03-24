const CODE_AGREEMENT_STATUS_FORBIDDEN = 'agreement-status-forbidden';
const CODE_AGREEMENT_STATUS_NO_TRANSACTIONS = 'agreement-no-transactions';

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

  static noRelevantTransactions(agreementId, owner, period) {
    const error = new BillingError(`Agreement "${agreementId}" has no transactions for period`);
    error.code = CODE_AGREEMENT_STATUS_NO_TRANSACTIONS;
    error.params = { agreementId, owner, period };
    return error;
  }
}

module.exports = BillingError;
