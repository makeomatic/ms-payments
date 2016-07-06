module.exports = exports = {
  amqp: {
    connection: {
      host: 'rabbitmq',
      port: 5672,
    },
  },
  redis: {
    hosts: ['1', '2', '3'].map(idx => ({
      host: `redis-${idx}`,
      port: 6379,
    })),
  },
  cart: {
    emailAccount: 'info@cappasity.com',
    template: 'cappasity-cart',
    from: 'info@cappasity.com',
    to: 'info@cappasity.com',
    subject: 'test cart transaction',
  },
};
