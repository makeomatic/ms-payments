/**
 * @property message
 * @property innerError
 */
class PublishingError extends Error {
  constructor(originalError) {
    super(`Failed to publish event. ${originalError.message}`);
    this.innerError = originalError;
  }
}

module.exports = PublishingError;
