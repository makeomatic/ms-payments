const { ActionTransport } = require('@microfleet/core');

const { getBalance } = require('../../utils/balance');

async function getBalanceAction({ params }) {
  const balance = await getBalance(this.redis, params.owner);

  return { balance };
}

getBalanceAction.transports = [ActionTransport.amqp];

module.exports = getBalanceAction;
