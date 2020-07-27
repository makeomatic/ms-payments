const { ActionTransport } = require('@microfleet/core');

const checkAllowedForAdmin = require('../../middlewares/admin-request-owner');
const { CHARGE_RESPONSE_FIELDS, chargeCollection } = require('../../utils/json-api');

/**
 * @api {http-get} <prefix>.charge.list List charges
 * @apiVersion 1.0.0
 * @apiName chargeList
 * @apiGroup Charge
 *
 * @apiDescription Get the list of charges
 *
 * @apiSchema {jsonschema=charge/list.json} apiRequest
 * @apiSchema {jsonschema=response/charge/list.json} apiResponse
 */
async function chargesListAction(request) {
  const { owner } = request.locals;
  const { offset, limit } = request.method === 'amqp' ? request.params : request.query;
  const [charges, total] = await this.charge.list(owner.id, offset, limit, CHARGE_RESPONSE_FIELDS);

  return chargeCollection(charges, { owner: owner.alias }, total, limit, offset);
}

chargesListAction.auth = 'token';
chargesListAction.allowed = checkAllowedForAdmin;
chargesListAction.transports = [ActionTransport.amqp, ActionTransport.http];
chargesListAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = chargesListAction;
