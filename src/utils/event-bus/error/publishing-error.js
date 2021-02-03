/**
 * @property message
 * @property inner_error
 */
class PublishingError extends Error {
  constructor(error) {
    super(`Failed to publish event. ${error}`);
    this.inner_error = error;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = PublishingError;
