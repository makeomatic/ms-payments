const AMQPTransport = require('@microfleet/transport-amqp');
const calcSlot = require('cluster-key-slot');
const omit = require('lodash/omit');
const Promise = require('bluebird');

const resolvedUsers = new Map();

/**
 *
 */
function getAMQPTransport(amqpConfig) {
  return AMQPTransport
    .connect(amqpConfig)
    .disposer(amqp => amqp.close());
}

/**
 *
 */
function getRedisMasterNode(redis, config) {
  const { keyPrefix } = config.redis.options;
  const slot = calcSlot(keyPrefix);
  const nodeKeys = redis.slots[slot];
  const { master } = redis.connectionPool.nodes;

  return nodeKeys.reduce((node, key) => node || master[key], null);
}

/**
 *
 */
function getKeyParts(key) {
  return key.split(':');
}

/**
 *
 */
function resolveUserId(email) {
  const { amqp, config, log } = this;
  const route = `${config.users.prefix}.${config.users.postfix.getInternalData}`;

  if (resolvedUsers.has(email) === true) {
    return Promise.resolve(resolvedUsers.get(email));
  }

  return amqp
    .publishAndWait(route, { username: email, fields: ['id'] }, { timeout: 5000 })
    .then(({ id }) => {
      if (resolvedUsers.has(email) === false) {
        resolvedUsers.set(email, id);
      }

      return id;
    })
    .catch({ statusCode: 404 }, (e) => {
      log.error(e);

      if (resolvedUsers.has(email) === false) {
        resolvedUsers.set(email, null);
      }

      return null;
    });
}

/**
 *
 */
function changeOwner(key) {
  const { redis, pipeline } = this;

  return redis
    .hget(key, 'owner')
    .then(owner => JSON.parse(owner))
    .then((owner) => {
      // owner can be "null" in database
      if (owner === null) {
        return [null, null];
      }

      return resolveUserId.call(this, owner);
    })
    .then((id) => {
      // e.g. exists in ms-users
      if (id !== null) {
        pipeline.hset(key, 'owner', JSON.stringify(id));
      }

      return Promise.resolve();
    });
}

/**
 *
 */
function checkEmail(email, key) {
  if (email.indexOf('@') === -1) {
    throw new Error(`Unknown key type: ${key}`);
  }
}

/**
 *
 */
function renameKey(email, key) {
  checkEmail(email, key);

  const { pipeline } = this;

  return resolveUserId
    .call(this, email)
    .then((id) => {
      if (id !== null) {
        pipeline.rename(key, key.replace(email, id));
      }

      return Promise.resolve();
    });
}

/**
 *
 */
function processAllTransactions(key) {
  const parts = getKeyParts(key);

  switch (parts[1]) {
    // "{ms-payments}all-transactions:sale"
    case 'sale':
    // "{ms-payments}all-transactions:print"
    // eslint-disable-next-line no-fallthrough
    case 'print':
    // "{ms-payments}all-transactions:subscription"
    // eslint-disable-next-line no-fallthrough
    case 'subscription':
    // "{ms-payments}all-transactions"
    // eslint-disable-next-line no-fallthrough
    case undefined:
      return Promise.resolve();

    case 'meta':
      // "{ms-payments}all-transactions:meta:A-BCD"
      return changeOwner.call(this, key);

    default:
      // "{ms-payments}all-transactions:foo@bar.baz"
      return renameKey.call(this, parts[1], key);
  }
}

/**
 *
 */
function processAgreementsIndex(key) {
  const parts = getKeyParts(key);

  // "{ms-payments}agreements-index:foo@bar.baz"
  if (parts[1] !== undefined) {
    return renameKey.call(this, parts[1], key);
  }

  // "{ms-payments}agreements-index"
  return Promise.resolve();
}

/**
 *
 */
function processTransactions(key) {
  const parts = getKeyParts(key);

  switch (parts[1]) {
    // "{ms-payments}transactions:meta:A-BCD"
    case 'meta':
      return changeOwner.call(this, key);

    // "{ms-payments}transactions"
    case undefined:
      return Promise.resolve();

    default:
      throw new Error(`Unknown key type: ${key}`);
  }
}

/**
 *
 */
function processKeys(amqp) {
  const { config, log, redis } = this;
  const { keyPrefix } = config.redis.options;
  const masterNode = getRedisMasterNode(redis, config);
  const pipeline = redis.pipeline();
  const context = {
    pipeline, log, amqp, redis, config,
  };

  log.info('Starting keys processing');

  return masterNode
    .keys('*')
    .map(key => key.replace(keyPrefix, ''))
    .each((key) => {
      log.info('Process key:', key);

      const parts = getKeyParts(key);

      // temp keys
      if (parts[1] === '' && parts[2] === 'fsort_temp_keys') {
        return Promise.resolve();
      }

      switch (parts[0]) {
        // "{ms-payments}plans-data:abcd"
        case 'plans-data':
        // "{ms-payments}plans-index"
        // eslint-disable-next-line no-fallthrough
        case 'plans-index':
        // "{ms-payments}sales-index"
        // eslint-disable-next-line no-fallthrough
        case 'sales-index':
          return Promise.resolve();

        case 'all-transactions':
          return processAllTransactions.call(context, key);

        case 'sales-data':
          // "{ms-payments}sales-data:A-BCD"
          return changeOwner.call(context, key);

        case 'agreements-index':
          return processAgreementsIndex.call(context, key);

        case 'transactions':
          return processTransactions.call(context, key);

        case 'agreements-data':
          // "{ms-payments}agreements-data:A-BCD"
          return changeOwner.call(context, key);

        default:
          throw new Error(`Unknown key type: ${key}`);
      }
    })
    .tap(() => pipeline.exec())
    .tap(() => log.info('That\'s all'));
}

/**
 *
 */
function migrate(app) {
  const { log, config } = app;

  log.info('Users ids replacement migration');

  const amqpConfig = omit(config.amqp.transport, ['queue', 'listen', 'neck', 'onComplete']);

  return Promise
    .using(
      getAMQPTransport(amqpConfig),
      amqp => processKeys.call(app, amqp)
    );
}

module.exports = {
  script: migrate,
  min: 0,
  final: 1,
};
