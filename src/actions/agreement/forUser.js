const Errors = require('common-errors');
const key = require('../../redisKey.js');

// helpers
const { AGREEMENT_DATA, FREE_PLAN_ID } = require('../../constants.js');
const { deserialize } = require('../../utils/redis.js');

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
      .then(metadata => metadata[audience].agreement);
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

module.exports = forUser;
