const Errors = require('common-errors');
const { ActionTransport } = require('@microfleet/core');

const key = require('../../redis-key');
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants');
const { deserialize } = require('../../utils/redis');

/**
 * @api {amqp} <prefix>.agreement.forUser Get agreement for user
 * @apiVersion 1.0.0
 * @apiName forUser
 * @apiGroup Agreement
 *
 * @apiDescription Retrieves agreement information for user
  *
 * @apiSchema {jsonschema=agreement/forUser.json} apiRequest
 * @apiSchema {jsonschema=response/agreement/forUser.json} apiResponse
 */
function forUser({ params: message }) {
  const { config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = config;
  const { user } = message;

  function getId() {
    const path = `${prefix}.${postfix.getMetadata}`;
    const getRequest = {
      username: user,
      audience,
    };

    return amqp
      .publishAndWait(path, getRequest, { timeout: 5000 })
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

        // for consistent return structure :(
        return {
          ...deserialize(data),
          id,
        };
      });
  }

  return getId().then(getAgreement);
}

forUser.transports = [ActionTransport.amqp];

module.exports = forUser;
