const Promise = require('bluebird');
const key = require('../../redisKey.js');
const { hmget } = require('../../listUtils.js');
const Errors = require('common-errors');
const EXTRACT_FIELDS = ['agreement', 'state', 'plan'];
const responseParser = hmget(EXTRACT_FIELDS, JSON.parse, JSON);

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
      .get(audience)
      .get('agreement');
  }

  function getAgreement(id) {
    if (id === 'free') {
      return { id };
    }

    const agreementKey = key('agreements-data', id);

    return redis
      .exists(agreementKey)
      .then(exists => {
        if (!exists) {
          throw new Errors.HttpStatusError(404, `agreement ${id} not found`);
        }

        return redis.hmget(agreementKey, EXTRACT_FIELDS);
      })
      .then(responseParser);
  }

  return Promise.bind(this).then(getId).then(getAgreement);
}

module.exports = forUser;
