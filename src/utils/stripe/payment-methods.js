const moment = require('moment');
const uuid = require('uuid/v4');

const assertStringNotEmpty = require('../asserts/string-not-empty');

class PaymentMethods {
  static collectionRedisKey(customerId) {
    assertStringNotEmpty(customerId, 'customerId is invalid');

    return `${customerId}:stripe:payment:methods`;
  }

  static objectRedisKeyPrefix() {
    return 'stripe:payment:methods:data';
  }

  constructor(config, client, customers, redisMapper) {
    this.config = config;
    this.client = client;
    this.customers = customers;
    this.redisMapper = redisMapper;
  }

  get METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID() {
    return this.config.consts.METADATA_FIELD_DEFAULT_PAYMENT_METHOD_ID;
  }

  // @todo candidate for webhook
  // @todo split on 3 methods if needed
  async attach(paymentMethodToken, internalCustomerId) {
    assertStringNotEmpty(paymentMethodToken, 'paymentMethodToken is invalid');
    assertStringNotEmpty(internalCustomerId, 'internalCustomerId is invalid');

    const { client, customers, redisMapper } = this;
    const id = uuid();
    const customer = await customers.getInternal(internalCustomerId);
    const stripeParams = { customer: customer.stripeId };

    const stripePaymentMethod = await client.request(
      'paymentMethods.attach',
      [paymentMethodToken, stripeParams],
      `payment:methods:attach:${id}`
    );

    const data = {
      id,
      stripeId: stripePaymentMethod.id,
      stripeType: stripePaymentMethod.type,
      cardBrand: stripePaymentMethod.card.brand,
      cardLast4: stripePaymentMethod.card.last4,
      cardExpMonth: String(stripePaymentMethod.card.exp_month),
      cardExpYear: String(stripePaymentMethod.card.exp_year),
      cardholderName: stripePaymentMethod.billing_details.name || '',
      cardholderEmail: stripePaymentMethod.billing_details.email || '',
      cardholderPhone: stripePaymentMethod.billing_details.phone || '',
      createdAt: moment().format(),
      updatedAt: moment().format(),
      metadata: JSON.stringify(stripePaymentMethod),
    };

    await redisMapper.addToCollection(
      PaymentMethods.collectionRedisKey(internalCustomerId),
      PaymentMethods.objectRedisKeyPrefix(),
      id,
      data
    );

    return data;
  }

  // @todo candidate for webhook
  // @todo split on 3 methods if needed
  async delete(customerId, paymentMethodId) {
    assertStringNotEmpty(customerId, 'customerId is invalid');
    assertStringNotEmpty(paymentMethodId, 'paymentMethodId is invalid');

    const paymentMethod = await this.internalGet(paymentMethodId);

    // it's more important to delete a payment method form redis
    // than to delete a payment method from stripe
    // move this to stripe webhook callback if consistent delete is needed
    await this.redisMapper.deleteFromCollection(
      PaymentMethods.collectionRedisKey(customerId),
      PaymentMethods.objectRedisKeyPrefix(),
      paymentMethodId
    );

    return this.client.request(
      'paymentMethods.detach',
      [paymentMethod.stripeId],
      `payment:methods:detach:${paymentMethod.stripeId}`
    );
  }

  internalGetAll(customerId) {
    assertStringNotEmpty(customerId, 'customerId is invalid');

    return this.redisMapper.fetchCollection(
      PaymentMethods.collectionRedisKey(customerId),
      PaymentMethods.objectRedisKeyPrefix()
    );
  }

  internalGet(id) {
    assertStringNotEmpty(id, 'id is invalid');

    return this.redisMapper.get([PaymentMethods.objectRedisKeyPrefix(), id].join(':'));
  }
}

module.exports = PaymentMethods;
