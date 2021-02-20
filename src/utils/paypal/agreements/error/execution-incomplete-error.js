/**
 * @property params.attemptsCount
 */
class ExecutionIncompleteError extends Error {
  constructor(reason) {
    super(`Execution incomplete. Reason: ${reason}`);
  }

  static noTransactionsAfter(agreementId, owner, attemptsCount) {
    const reason = `Agreement "${agreementId}" has been executed, but there is no sufficient transactions after ${attemptsCount} attempts`;
    const error = new ExecutionIncompleteError(reason);
    error.params = { agreementId, owner, attemptsCount };

    return error;
  }
}

module.exports = ExecutionIncompleteError;
