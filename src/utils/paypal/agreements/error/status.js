const CODE_AGREEMENT_STATUS_FORBIDDEN = 'agreement-status-forbidden';

class AgreementStatusError extends Error {
  constructor(agreementId, owner, status, taskId) {
    super(`Agreement "${agreementId}" has status "${status}"`);

    this.code = CODE_AGREEMENT_STATUS_FORBIDDEN;
    this.params = { agreementId, owner, status, taskId };
  }

  getHookErrorData() {
    return {
      message: this.message,
      code: this.code,
      params: this.params,
    };
  }
}

module.exports = {
  AgreementStatusError,
};
