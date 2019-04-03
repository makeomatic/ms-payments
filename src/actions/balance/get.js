const { ActionTransport } = require('@microfleet/core');

async function getBalanceAction({ params }) {
  const balance = await this.balance.get(params.owner);

  return { balance };
}

getBalanceAction.transports = [ActionTransport.amqp];

module.exports = getBalanceAction;
