const { ActionTransport } = require('@microfleet/core');

const checkAllowedForAdmin = require('../../middlewares/admin-request-owner');
const { balance: balanceResponse } = require('../../utils/json-api');

async function getBalanceAction(request) {
  const { owner } = request.locals;
  const balance = await this.balance.get(owner.id);

  return balanceResponse(owner.alias, balance);
}

getBalanceAction.auth = 'token';
getBalanceAction.allowed = checkAllowedForAdmin;
getBalanceAction.transports = [ActionTransport.http];
getBalanceAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = getBalanceAction;
