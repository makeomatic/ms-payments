const get = require('get-value');

const NAME_INVALID_TOKEN = 'INVALID_TOKEN';

/**
 * @property statusCode
 * @property message
 * @property name
 * @property {Object} [originalRequest]
 */
class RequestError extends Error {
  constructor(statusCode, name, message, originalRequest) {
    super(message);
    this.statusCode = statusCode;
    this.name = name;
    this.originalRequest = originalRequest;
  }

  static wrapOrigin(error) {
    return new RequestError(
      error.httpStatusCode,
      get(error, 'response.name', error.name),
      get(error, 'response.message', error.message),
      error.originalRequest
    );
  }

  isTokenInvalidError() {
    return this.name === NAME_INVALID_TOKEN;
  }
}

module.exports = RequestError;
