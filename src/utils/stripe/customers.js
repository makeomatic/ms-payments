const uuid = require('uuid/v4');
const moment = require('moment');
const Promise = require('bluebird');

const assertPlainObject = require('../asserts/plain-object');
const assertStringNotEmpty = require('../asserts/string-not-empty');

class Customers {
  static objectRedisKey(id) {
    assertStringNotEmpty(id, 'id is invalid');

    return `${id}:stripe:customer`;
  }

  constructor(config, client, redis, redisMapper, users) {
    this.config = config;
    this.client = client;
    this.redis = redis;
    this.redisMapper = redisMapper;
    this.users = users;
  }

  get METADATA_FIELD_CUSTOMER_ID() {
    return this.config.consts.METADATA_FIELD_CUSTOMER_ID;
  }

  // @todo candidate for webhook
  // @todo split on 3 methods if needed
  async create(data = {}) {
    assertPlainObject(data, 'data is invalid');

    const { redis, client, users } = this;
    const id = uuid();
    const {
      [users.METADATA_FIELD_FIRST_NAME]: firstName = null,
      [users.METADATA_FIELD_LAST_NAME]: lastName = null,
      [users.METADATA_FIELD_EMAIL]: email = null,
    } = data;
    const name = `${(firstName || '')} ${(lastName || '')}`.trim();

    const stripeCustomer = await client.request(
      'customers.create',
      [{ name, email, metadata: { internalId: id } }],
      `customer:create:${id}`
    );

    const customer = {
      id,
      name,
      email: email || '',
      stripeId: stripeCustomer.id,
      createdAt: moment().format(),
      updatedAt: moment().format(),
      metadata: JSON.stringify(stripeCustomer),
    };

    await redis.hmset(Customers.objectRedisKey(id), customer);

    return customer;
  }

  async getInternal(id) {
    assertStringNotEmpty(id, 'id is invalid');

    return this.redisMapper.get(Customers.objectRedisKey(id));
  }

  // @todo candidate for webhook
  // @todo split on 3 methods if needed
  async delete(id) {
    assertStringNotEmpty(id, 'id is invalid');

    const { redis, client } = this;
    const customer = await this.getInternal(id);

    await Promise.all([
      redis.del(Customers.objectRedisKey(id)),
      client.request('customers.del', [customer.stripeId], `customer:del:${id}`),
    ]);
  }

  /**
   * Resolve internal customer id from user's getMetadata
   * and then create or retrieve internal customer object
   *
   * @param {string} userId
   * @return {object}
   */
  async setupCustomerForUserId(userId) {
    assertStringNotEmpty(userId, 'userId is invalid');

    const { users } = this;
    const {
      [this.METADATA_FIELD_CUSTOMER_ID]: customerId = null,
    } = await users.getMetadata(userId, users.paymentAudience, { public: false });

    let customer = null;

    if (customerId === null) {
      const metadata = await users.getMetadata(userId, users.defaultAudience, { public: false });
      customer = await this.create(metadata);

      await users
        .setMetadata(userId, users.paymentAudience, { $set: {
          [this.METADATA_FIELD_CUSTOMER_ID]: customer.id },
        })
        .tapCatch(() => this.delete(customer.id));
    } else {
      customer = await this.getInternal(customerId);
    }

    return customer;
  }
}

module.exports = Customers;
