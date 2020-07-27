const { ActionTransport } = require('@microfleet/core');

const checkAllowedForAdmin = require('../../middlewares/admin-request-owner');
const { balance: balanceResponse } = require('../../utils/json-api');

/**
 * @api {get} <prefix>.balance.get Get balance
 * @apiVersion 1.0.0
 * @apiName balanceGet
 * @apiGroup Balance
 *
 * @apiSchema {jsonschema=balance/decrement.json} apiRequest
 * @apiSchema {jsonschema=response/balance/decrement.json} apiResponse
 */
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
