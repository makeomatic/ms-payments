const { ActionTransport } = require('@microfleet/core');

async function chargesListAction({ params }) {
  const { owner, offset, limit } = params;

  return this.charge.list(owner, offset, limit);
}

chargesListAction.transports = [ActionTransport.amqp];

module.exports = chargesListAction;
