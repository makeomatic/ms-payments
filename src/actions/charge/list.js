const { ActionTransport } = require('@microfleet/core');

const checkAllowedForAdmin = require('../../middlewares/admin-request-owner');
const { CHARGE_RESPONSE_FIELDS, chargeCollection } = require('../../utils/json-api');

async function chargesListAction(request) {
  const { owner } = request.locals;
  const { offset, limit } = request.query;
  const [charges, total] = await this.charge.list(owner.id, offset, limit, CHARGE_RESPONSE_FIELDS);

  return chargeCollection(charges, { owner: owner.alias }, total, limit, offset);
}

chargesListAction.auth = 'token';
chargesListAction.allowed = checkAllowedForAdmin;
chargesListAction.transports = [ActionTransport.http];
chargesListAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = chargesListAction;
