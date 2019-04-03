const { ActionTransport } = require('@microfleet/core');

async function stripeWebhookAction(request) {
  const event = await this.stripe.getEventFromRequest('charge', request);

  if (event.type === 'charge.succeeded') {
    const { id: sourceId, metadata: { internalId } } = event.data.object;
    const { amount, owner } = await this.charge.get(internalId, false);
    const pipeline = this.redis.pipeline();

    await this.charge.markAsComplete(internalId, sourceId, event, pipeline);
    await this.balance.increment(owner, Number(amount), pipeline);
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
