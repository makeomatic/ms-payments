const Promise = require('bluebird');
const retry = require('bluebird-retry');
const get = require('lodash/get');
const { NotImplementedError } = require('common-errors');
const { AMQPPublisher } = require('./publisher');
const { PublishingError } = require('./error');

const defaultRetryOptions = {
  timeout: 25000,
  max_tries: 10,
  interval: 500,
  backoff: 2,
  max_interval: 5000,
  throw_original: true,
  // @todo concrete publisher agnostic custom error
  predicate: { statusCode: 429 },
};

/**
 * Builds publisher function for subscriber
 * @param publisher
 * @param message
 * @returns {function(*): *}
 * @throws {PublishingError} Original error wrapper
 */
const initPublisherForSubscriber = (publisher, log, message) => async (subscriber) => {
  const { endpoint, publishing } = subscriber;
  const args = [endpoint, message];
  const retryEnabled = get(publishing, ['retry', 'enabled'], true);

  let publishPromise;
  if (!retryEnabled) {
    publishPromise = publisher.publish(...args);
  } else {
    const retryOptions = get(publishing, ['retry', 'options'], defaultRetryOptions);
    publishPromise = retry(publisher.publish, { context: publisher, args, ...retryOptions });
  }

  try {
    return await publishPromise;
  } catch (e) {
    const wrap = new PublishingError(e);
    log.error({ err: wrap.innerError }, wrap.message);
    throw wrap;
  }
};

/**
 * @param {Object} subscription
 * @returns {*|any[]}
 */
const getNormalizedSubscribers = (subscription) => {
  return Array.isArray(subscription)
    ? subscription
    : Array(subscription);
};

/**
 * @property subscriptions {Map<{String}, {String}>} Map of event names to its subscribers
 * @property publisher {AMQPPublisher} For now, only one transport is supported
 * @property log {Microfleet['log']} Logger
 */
class EventBus {
  constructor(publisher, log) {
    this.subscriptions = new Map();
    this.publisher = publisher;
    this.log = log;
  }

  /**
   * @todo validate subscriber (when it comes from config it's validated, but we still need it from the unit perspective)
   *
   * @param {String} event
   * @param {Object} subscriber
   * @throws When uses unregistered publisher
   */
  subscribe(event, subscriber) {
    if (this.subscriptions.has(event) === false) {
      this.subscriptions.set(event, []);
    }
    this.subscriptions.get(event).push(subscriber);
  }

  /**
   * @param event
   * @param subscriber
   */
  // eslint-disable-next-line no-unused-vars,class-methods-use-this
  unsubscribe(event, subscriber) {
    throw new NotImplementedError('@todo Unsubscription');
  }

  /**
   * @param {String} event
   * @param {Object} message
   * @return {Promise<Array<{Object|PublishingError}>>} Publishing results
   */
  async publish(event, message) {
    const subscribers = this.subscriptions.get(event);

    if (subscribers === undefined) {
      return [];
    }

    const { publisher, log } = this;
    const pool = subscribers.map(initPublisherForSubscriber(publisher, log, message));

    return Promise.all(pool);
  }

  /**
   * @param {Object} amqp AMQPTransport
   * @param {Object} subscriptions Subscriptions config
   * @param {Microfleet['log]} log Logger
   * @return {EventBus}
   */
  static fromParams(amqp, subscriptions, log) {
    const bus = new EventBus(new AMQPPublisher(amqp), log);

    for (const [event, subscribers] of Object.entries(subscriptions.events)) {
      const normalizedSubscribers = getNormalizedSubscribers(subscribers);

      for (const subscriber of normalizedSubscribers) {
        bus.subscribe(event, subscriber);
      }
    }

    return bus;
  }
}

module.exports = EventBus;
