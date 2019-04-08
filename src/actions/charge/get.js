const { HttpStatusError } = require('common-errors');
const { ActionTransport } = require('@microfleet/core');
const { USERS_ADMIN_ROLE } = require('ms-users/lib/constants');

const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../utils/json-api');

const notAllowedHttpError = new HttpStatusError(403, 'not enough rights');

function assertEnouthRights(charge, user) {
  const { id: ownerId, roles } = user;

  if (roles.includes(USERS_ADMIN_ROLE) === false && charge.owner !== ownerId) {
    throw notAllowedHttpError;
  }
}

async function getChargeAction({ auth, query }) {
  const { users: { audience } } = this.config;
  const user = auth.credentials.metadata[audience];
  const charge = await this.charge.get(query.id, CHARGE_RESPONSE_FIELDS);

  if (charge !== null) {
    assertEnouthRights(charge, user);
  }

  return chargeResponse(charge, { owner: '[[protected]]' });
}

getChargeAction.auth = 'token';
getChargeAction.transports = [ActionTransport.http];
getChargeAction.transportOptions = {
  [ActionTransport.http]: {
    methods: ['get'],
  },
};

module.exports = getChargeAction;
