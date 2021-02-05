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
   * @todo check result is OK
   * @todo set up timeout
   *
   * @param {String} route
   * @param {*} message
   * @returns {Promise<void>}
   */
  async publish(route, message) {
    return this.amqp.publishAndWait(route, message, {
      confirm: true,
      mandatory: true,
      deliveryMode: 2,
    });
  }
}

module.exports = AMQPPublisher;
