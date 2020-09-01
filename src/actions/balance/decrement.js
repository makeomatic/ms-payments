const { ActionTransport } = require('@microfleet/core');

const lockWrapper = require('../../utils/action/helpers/acquire-lock');

async function decrementBalanceAction(request) {
  const { ownerId, amount, idempotency, goal } = request.params;

  return this.balance.decrement(ownerId, amount, idempotency, goal);
}

const actionWrapper = lockWrapper(decrementBalanceAction, 'tx!balance:decrement', 'params.ownerId', 'params.idempotency');

actionWrapper.transports = [ActionTransport.amqp];

module.exports = actionWrapper;
