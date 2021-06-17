/**
 * @property params.attemptsCount
 */
class ExecutionIncompleteError extends Error {
  constructor(reason) {
    super(`Execution incomplete. Reason: ${reason}`);
  }

  static noTransaction(agreementId, owner, taskId) {
    const reason = `Agreement "${agreementId}" has been executed, but there is no sufficient transactions`;
    const error = new ExecutionIncompleteError(reason);
    error.params = { agreementId, owner, taskId };

    return error;
  }
}

module.exports = ExecutionIncompleteError;
