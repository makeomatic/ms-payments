# Payment Event Subscriptions

## Motivation
MS-Payments used to be loosely coupled with another domain logic. We aim to distill the API between MS-Payments and any kind of userland code it is attached to. Payment hooks subscriptions come as a solution.
These hooks are considered as unidirectional publish-only messages that spread event data across internal endpoints and attached microservices and are not aware of its consumers. Cross-microservice authentication is not standardized yet due to internal-only usage.
Since there could be several subscribers, hooks configuration should allow to subscribe many endpoints.

## Design

### Event
For now, event is a unique string event identifier.
The service should start with the following events support:
* `paypal:agreements:billing:success`
* `paypal:agreements:billing:failure`
* `paypal:agreements:execution:success`
* `paypal:agreements:execution:failure`
* `paypal:agreements:finalization:success`
* `paypal:agreements:finalization:failure`
* `paypal:transasctions:create`

### Subscriber
For now, it should be identified by target endpoint - `endpoint`.
In the future, we may want to extend subscriber configuration with the `transport` type, for instance, HTTP, so the definition of the subscriber should be represented with a compound data type.

### Payload
* Body must have JSON format
* Body must comply a common schema:
  * `meta` - event metadata, including reserved and custom properties. Metadata should provide following data:
    * `type` - constant hook type (it is better to transfer it in headers )
    * `id` - unique hook identifier for better tracing
  * `data` - event payload, should have consistent format within the same hook type

```json
{
  "$id": "hooks.domain.event",
  "type": "object",
  "description": "Hook description",
  "required": ["meta", "data"],
  "properties": {
    "meta": {
      "type": "object",
      "properties": {
        "type": { "const": "domain.event" },
        "id": { "type": "string" }
      }
    },
    "data": { "type": "object" }
  }
}
```

### EventBus
To deliver messages we need to create a message channel. It should be:
- Unidirectional, `publish-only`
- One-to-many, since there could be several subscribers
- Support expected message structure
- Crash-proof - guaranteed delivery (persistent delivery mode, retry policy)
- Open to extension by another type of transport, for example HTTP

```js
/**
 * @property publisher {AMQPPublisher} For now, only one transport is supported
 * @property subscriptions {Map<{String}, {String}>} Map of event names to its subscribers
 * @property log {Microfleet['log']} Logger
 */
class EventBus {

  /**
   * @param amqp transport (could be any)
   */
  constructor(amqp) {}

  /**
   * Adds subscriber to the subscriptions map
   * 
   * @param {String} event
   * @param {Object} subscriber
   */
  subscribe(event, subscriber) {}

  /**
   * Removes subscriber from the subscriptions map
   * 
   * Just a scaffold to mirror the `subscribe` method. We don't need it for now, but it's a good practice to plan mirror 
   * methods from the very beginning.
   * 
   * @param event
   * @param subscriber
   */
  unsubscribe(event, subscriber) {}

  /**
   * Finds event subscriptions and delegates publishing to the publisher
   * 
   * @param {String} event
   * @param {Object} payload
   * @return {Promise<Array<any|PublishingError>>} Array of publishing promises
   */
  async publish(event, payload) {}

  /**
   * Factory method that creates EventBus instance and sets it up with subscriptions from config and the amqp publisher
   * 
   * @param {Object} subscriptions Subscriptions config
   * @return {PaymentEventPubSub}
   */
  static fromParams(amqp, subscriptions, log) {}
}
```

### Publisher
Each publisher should implement guaranteed message delivery. It also may have some additional features. The only interface method it should have is `publish`:
```js
/**
 * Publishes a message
 * 
 * @param {String} route
 * @param {*} message
 * @param [options] {} Optional param method signature could be extended with
 * @returns {Promise<any>}
 */
async publish(route, message, options);
```

AMQP Publisher:
```js
class AMQPPublisher {
  constructor(amqp, log) {}

  /**
   * Publishes a message
   * 
   * @param {String} route
   * @param {Object} message
   * @returns {Promise<Object>}
   */
  async publish(route, message) {}
}
```

### Configuration
The suggested name for configuration is `event-subscriptions` to avoid collisions with plans subscriptions term.
As for the structure, it should be able to hold any number of subscribers for each event.
```js
exports.subscriptions = {
  events: {
    'paypal:agreements:execution:success': [],
    'paypal:agreements:execution:failure': [],
    'paypal:agreements:finalization:success': [],
    'paypal:agreements:finalization:failure': [],
    'paypal:agreements:billing:success': {
      endpoint: 'ms-billing.paypal.agreements.billing.success',
      publishing: {
        retry: {
          enabled: true,
          options: {
            timeout: 25000,
            max_tries: 10,
            interval: 500,
            backoff: 2,
            max_interval: 5000,
            throw_original: true,
            predicate: (e) => e.statusCode === 429,  
          },
        },
      }, 
    },
    'paypal:agreements:billing:failure': [{ endpoint: 'ms-billing.paypal.agreements.billing.failure' }],
    'paypal:transactions:create': [],
  },
};
```
