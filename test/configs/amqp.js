module.exports = {
  amqp: {
    connection: {
      host: process.env.RABBITMQ_PORT_5672_TCP_ADDR,
      port: process.env.RABBITMQ_PORT_5672_TCP_PORT,
    },
  },
};
