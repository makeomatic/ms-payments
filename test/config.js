module.exports = exports = {
  amqp: {
    transport: {
      connection: {
        host: 'rabbitmq',
        port: 5672,
      },
    },
  },
  redis: {
    hosts: Array.from({ length: 3 }).map((_, idx) => ({
      host: 'redis',
      port: 7000 + idx,
    })),
  },
  cart: {
    emailAccount: 'info@cappasity.com',
    template: 'cpst-cart',
    from: 'info@cappasity.com',
    to: 'info@cappasity.com',
    subject: 'test cart transaction',
  },
};
