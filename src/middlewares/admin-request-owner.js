const { HttpStatusError } = require('common-errors');
const { USERS_ADMIN_ROLE } = require('ms-users/lib/constants');

const notAllowedHttpError = new HttpStatusError(403, 'not enough rights');
const notFoundHttpError = new HttpStatusError(404, 'user not found');
const notFoundError = { statusCode: 404 };

async function adminRequestOwner(request) {
  const { users: { prefix, postfix, audience } } = this.config;
  const { owner } = request.query;
  const currentUser = request.auth.credentials.metadata[audience];

  if (owner === undefined || owner === currentUser.alias) {
    const { id, alias } = currentUser;

    request.locals.owner = { id, alias };

    return true;
  }

  if (currentUser.roles.includes(USERS_ADMIN_ROLE) !== false) {
    const user = await this.amqp
      .publishAndWait(`${prefix}.${postfix.getMetadata}`, { audience, username: owner, public: true })
      .get(audience)
      .catchThrow(notFoundError, notFoundHttpError);
    const { id, alias } = user;

    request.locals.owner = { id, alias };

    return true;
  }

  throw notAllowedHttpError;
}

module.exports = adminRequestOwner;
