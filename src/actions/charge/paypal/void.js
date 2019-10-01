const { ActionTransport } = require('@microfleet/core');
const { HttpStatusError } = require('common-errors');
const assert = require('assert');

const lockWrapper = require('../../../utils/action/helpers/acquire-lock');
const assertStringNotEmpty = require('../../../utils/asserts/string-not-empty');
const { STATUS_AUTHORIZED, retreiveAuthorizationId } = require('../../../utils/charge');
const { CHARGE_RESPONSE_FIELDS, charge: chargeResponse } = require('../../../utils/json-api');
const { LOCK_PAYPAL_CHARGE_COMPLETE } = require('../../../constants');

const alreadyExecutedError = new HttpStatusError(400, 'already executed');

async function paypalVoidAction(request) {
  const { paymentId } = request.params;
  const chargeId = await this.paypal.getInternalId(paymentId);

  assertStringNotEmpty(chargeId);

  const charge = await this.charge.get(chargeId);
  assert.equal(charge.status, STATUS_AUTHORIZED, alreadyExecutedError);
  const sourceMetadata = JSON.parse(charge.sourceMetadata);
  const authorizationId = retreiveAuthorizationId(sourceMetadata);
  const paypalPayment = await this.paypal.void(authorizationId);

  this.log.info({ paypalPayment }, 'voided paypal payment');

  sourceMetadata.authorization = paypalPayment;
  const action = paypalPayment.state.toLowerCase() === 'voided'
    ? 'markAsCanceled'
    : 'markAsFailed';

  await this.charge[action](chargeId, paymentId, sourceMetadata, paypalPayment.reason_code || 'voided');

  const updatedCharge = await this.charge.get(chargeId, CHARGE_RESPONSE_FIELDS);
  return chargeResponse(updatedCharge, { owner: updatedCharge.owner });
}

const actionWrapper = lockWrapper(paypalVoidAction, ...LOCK_PAYPAL_CHARGE_COMPLETE);

actionWrapper.transports = [ActionTransport.amqp];

module.exports = actionWrapper;
