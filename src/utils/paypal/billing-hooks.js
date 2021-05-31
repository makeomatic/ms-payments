const { pick } = require('lodash');

const successEvent = 'paypal:agreements:execution:success';
const failureEvent = 'paypal:agreements:execution:failure';

const publishHook = (amqp, event, payload) => amqp.publish(
  'payments.hook.publish',
  { event, payload },
  {
    confirm: true,
    mandatory: true,
    deliveryMode: 2,
    priority: 0,
  }
);

const paidAgreementPayload = (agreement, token, state, owner) => ({
  owner,
  token,
  id: agreement.id,
  status: state.toLowerCase(),
});

const successPayload = (agreement, token, owner, transaction) => ({
  agreement: paidAgreementPayload(agreement, token, agreement.state, owner),
  transaction,
});

const publishFailureHook = (amqp, executionError) => publishHook(
  amqp,
  failureEvent,
  { error: pick(executionError, ['message', 'code', 'params']) }
);

const publishSuccessHook = (amqp, payload) => publishHook(amqp, successEvent, payload);

module.exports = {
  publishHook,
  publishSuccessHook,
  publishFailureHook,
  successPayload,
};
