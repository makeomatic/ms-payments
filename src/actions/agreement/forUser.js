const Errors = require('common-errors');
const { ActionTransport } = require('@microfleet/core');

const key = require('../../redis-key');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');
const { deserialize } = require('../../utils/redis');

function forUser({ params: message }) {
  const { config, redis, amqp } = this;
  const { users: { prefix, postfix, audience, timeouts } } = config;
  const { user } = message;

  function getId() {
    const usersMetadataRoute = `${prefix}.${postfix.getMetadata}`;
    const getRequest = {
      username: user,
      audience,
    };

    return amqp
      .publishAndWait(usersMetadataRoute, getRequest, { timeout: timeouts.getMetadata })
      .then((metadata) => metadata[audience].agreement);
  }

  function getAgreement(id) {
    if (id === FREE_PLAN_ID) {
      return { id, agreement: { id } };
    }

    const agreementKey = key(AGREEMENT_DATA, id);

    return redis
      .hgetall(agreementKey)
      .then((data) => {
        if (!data) {
          throw new Errors.HttpStatusError(404, `agreement ${id} not found`);
        }

        return deserialize(data);
      });
  }

  return getId().then(getAgreement);
}

forUser.transports = [ActionTransport.amqp];

module.exports = forUser;
