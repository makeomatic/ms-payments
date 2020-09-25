const { ActionTransport } = require('@microfleet/core');

/**
 * @api {http-post} <prefix>.charge.stripe.webhook Stripe - Webhook handler
 * @apiVersion 1.0.0
 * @apiName chargeStripeWebhook
 * @apiGroup Charge.Stripe
 *
 * @apiDescription Handles requests from Stripe
 *
 * @apiSchema {jsonschema=charge/stripe/webhook.json} apiRequest
 * @apiSchema {jsonschema=response/charge/stripe/webhook.json} apiResponse
 */
async function stripeWebhookAction(request) {
  // @todo check IP from white list (it's already in config)
  const event = await this.stripe.getEventFromRequest('charge', request);

  if (event.type === 'charge.succeeded') {
    const { id: sourceId, metadata: { internalId } } = event.data.object;
    const { amount, owner } = await this.charge.get(internalId);
    const pipeline = this.redis.pipeline();

    await this.charge.markAsComplete(internalId, sourceId, event, pipeline);
    await this.balance.increment(owner, Number(amount), internalId, internalId, pipeline);
    await pipeline.exec();
  }

  if (event.type === 'charge.failed') {
    const { id: sourceId, metadata: { internalId }, failure_message: errorMessage } = event.data.object;
    await this.charge.markAsFailed(internalId, sourceId, event, errorMessage);
  }

  return { received: true };
}

stripeWebhookAction.transports = [ActionTransport.http];
stripeWebhookAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
  handlers: {
    hapi: {
      method: ['POST'],
      options: {
        payload: {
          output: 'data',
          parse: false,
        },
      },
    },
  },
};

module.exports = stripeWebhookAction;
