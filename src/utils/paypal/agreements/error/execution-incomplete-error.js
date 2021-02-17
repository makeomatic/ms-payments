/**
 * @property attemptsCount
 */
class ExecutionIncompleteError extends Error {
  constructor(attemptsCount) {
    super(`Execution incomplete. No transactions after ${attemptsCount} attempts`);
    this.attemptsCount = attemptsCount;
  }

  static fromParams(attemptsCount) {
    return new ExecutionIncompleteError(attemptsCount);
  }
}

module.exports = ExecutionIncompleteError;
