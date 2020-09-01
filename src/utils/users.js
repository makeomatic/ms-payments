const { HttpStatusError, ValidationError } = require('common-errors');

const assertPlainObject = require('./asserts/plain-object');
const assertStringNotEmpty = require('./asserts/string-not-empty');

class Users {
  constructor(config, amqp) {
    assertPlainObject(config, new ValidationError('Users config is invalid'));

    this.config = config;
    this.amqp = amqp;
  }

  get defaultAudience() {
    return this.config.audience;
  }

  get paymentAudience() {
    return this.config.paymentAudience;
  }

  get METADATA_FIELD_FIRST_NAME() {
    return this.config.consts.METADATA_FIELD_FIRST_NAME;
  }

  get METADATA_FIELD_LAST_NAME() {
    return this.config.consts.METADATA_FIELD_LAST_NAME;
  }

  get METADATA_FIELD_EMAIL() {
    return this.config.consts.METADATA_FIELD_EMAIL;
  }

  // @TODO I hope we can use this method in other files
  getMetadata(userId, audience, requestParams = { public: true }) {
    assertStringNotEmpty(userId, 'userId is invalid');
    assertStringNotEmpty(audience, 'audience is invalid');
    assertPlainObject(requestParams, 'requestParams is invalid');

    const { prefix, postfix } = this.config;

    return this.amqp
      .publishAndWait(
        `${prefix}.${postfix.getMetadata}`,
        { audience, username: userId, ...requestParams }
      )
      .get(audience)
      .catchThrow(Users.userNotFoundError, Users.userNotFoundHttpError);
  }

  // @TODO I hope we can use this method in other files
  setMetadata(userId, audience, metadata) {
    assertStringNotEmpty(userId, 'userId is invalid');
    assertStringNotEmpty(audience, 'audience is invalid');
    assertPlainObject(metadata, 'metadata is invalid');

    const { prefix, postfix } = this.config;

    return this.amqp
      .publishAndWait(
        `${prefix}.${postfix.updateMetadata}`,
        { audience, username: userId, metadata },
        { timeout: 5000 }
      );
  }
}

Users.userNotFoundError = { statusCode: 404 };
Users.userNotFoundHttpError = new HttpStatusError(404, 'User not found');

module.exports = Users;
