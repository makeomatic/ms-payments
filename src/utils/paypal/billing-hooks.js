const { pick } = require('lodash');

const executionSuccessEvent = 'paypal:agreements:execution:success';
const executionFailureEvent = 'paypal:agreements:execution:failure';
const finalizationSuccessEvent = 'paypal:agreements:finalization:success';
const finalizationFailureEvent = 'paypal:agreements:finalization:failure';

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

const successExecutionPayload = (agreement, token, owner, creatorTaskId, transaction) => ({
  agreement: paidAgreementPayload(agreement, token, agreement.state, owner),
  creatorTaskId,
  transaction,
});

const publishExecutionFailureHook = (amqp, executionError) => publishHook(
  amqp,
  executionFailureEvent,
  { error: pick(executionError, ['message', 'code', 'params']) }
);

const publishExecutionSuccessHook = (amqp, payload) => publishHook(amqp, executionSuccessEvent, payload);

const publishFinalizationFailureHook = (amqp, executionError) => publishHook(
  amqp,
  finalizationFailureEvent,
  { error: pick(executionError, ['message', 'code', 'params']) }
);

const publishFinalizationSuccessHook = (amqp, payload) => publishHook(amqp, finalizationSuccessEvent, payload);

module.exports = {
  publishHook,
  publishExecutionSuccessHook,
  publishExecutionFailureHook,
  successExecutionPayload,
  publishFinalizationSuccessHook,
  publishFinalizationFailureHook,
};
