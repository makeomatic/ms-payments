const key = require('../../redisKey.js');
const Errors = require('common-errors');
const { AGREEMENT_DATA } = require('../../constants.js');
const JSONParse = JSON.parse.bind(JSON);
const mapValues = require('lodash/mapValues');

function forUser(message) {
  const { _config, redis, amqp } = this;
  const { users: { prefix, postfix, audience } } = _config;
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
    if (id === 'free') {
      return { id };
    }

    const agreementKey = key(AGREEMENT_DATA, id);

    return redis
      .hgetall(agreementKey)
      .then(data => {
        if (!data) {
          throw new Errors.HttpStatusError(404, `agreement ${id} not found`);
        }

        return mapValues(data, JSONParse);
      });
  }

  return getId().then(getAgreement);
}

module.exports = forUser;
