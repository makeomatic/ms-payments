const { ActionTransport } = require('@microfleet/core');

const { handlePipeline } = require('../../../utils/redis');
const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const { CHARGE_SOURCE_PAYPAL } = require('../../../utils/charge');
const { charge: chargeResponse } = require('../../../utils/json-api');

async function createPaypalChargeAction(request) {
  const { id: ownerId } = request.auth.credentials;
  const { audience } = this.config.users;
  const { alias } = request.auth.credentials.metadata[audience];

  // use owner id instead of alias
  const params = { owner: ownerId, ...request.params };
  const { amount, description, owner, returnUrl, cancelUrl } = params;

  // create internal record
  const charge = await this.charge.create(CHARGE_SOURCE_PAYPAL, owner, amount, description, params);
  const chargeId = charge.id;

  // create paypal payment
  const paypalPayment = await this.paypal
    .createPayment(chargeId, { amount, description, returnUrl, cancelUrl });
  const approvalUrl = paypalPayment.links.find((link) => link.rel === 'approval_url');
  const sourceId = paypalPayment.id;

  const pipeline = this.redis.pipeline();
  await this.paypal.setInternalId(sourceId, chargeId, pipeline);
  await this.charge.updateSource({ id: chargeId, sourceId, sourceMetadata: paypalPayment }, pipeline);
  await pipeline.exec().then(handlePipeline);

  return chargeResponse(charge, { owner: alias }, { paypal: { approvalUrl, paymentId: sourceId } });
}

const actionWrapper = lockWrapper(createPaypalChargeAction, 'tx!charge:create:paypal', 'auth.credentials.id');

actionWrapper.auth = 'token';
actionWrapper.transports = [ActionTransport.amqp, ActionTransport.http];
actionWrapper.transportOptions = {
  [ActionTransport.http]: {
    methods: ['post'],
  },
};

module.exports = actionWrapper;
