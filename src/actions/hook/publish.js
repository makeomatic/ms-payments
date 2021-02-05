const { ActionTransport } = require('@microfleet/core');

/**
 * @api {AMQP,internal} hook.publish Publish hook
 * @apiVersion 1.0.0
 * @apiName hookPublish
 * @apiGroup Hook
 * @apiDescription Publishes hook
 * @apiSchema {jsonschema=hook/publish.json} apiRequest
 * @apiSchema {jsonschema=response/hook/publish.json} apiResponse
 */
function hookPublish({ params }) {
  const { event, payload } = params;

  return this.eventBus.publish(event, {
    meta: { type: event },
    data: payload,
  });
}

hookPublish.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = hookPublish;
