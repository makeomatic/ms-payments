/**
 * @property amqp {AMQPTransport} AMQPTransport
 * @property log {Microfleet['log]} Logger
 */
class AMQPPublisher {
  constructor(amqp, log) {
    this.amqp = amqp;
    this.log = log;
  }

  /**
   * @todo check result is 200
   * @todo set up timeout
   *
   * @param {String} route
   * @param {*} message
   * @returns {Promise<void>}
   */
  async publish(route, message) {
    console.log('args', {
      route,
      message,
      options: {
        confirm: true,
        mandatory: true,
        deliveryMode: 2,
      },
    });

    const result = await this.amqp.publishAndWait(route, message, {
      confirm: true,
      mandatory: true,
      deliveryMode: 2,
    });

    console.log('publish result', result);

    return result;
  }
}

module.exports = AMQPPublisher;
