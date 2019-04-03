const { ActionTransport } = require('@microfleet/core');

async function getChargeAction({ params }) {
  const { id } = params;

  return this.charge.get(id);
}

getChargeAction.transports = [ActionTransport.amqp];

module.exports = getChargeAction;
