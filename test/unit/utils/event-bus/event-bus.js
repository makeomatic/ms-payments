const assert = require('assert');
const sinon = require('sinon');
const { EventBus, error: eventBusError } = require('../../../../src/utils/event-bus');
const AMQPPublisher = require('../../../../src/utils/event-bus/publisher/amqp');
const { subscriptions } = require('../../../configs/subscriptions');

describe('Event bus', () => {
  const sandbox = sinon.createSandbox();
  const log = { warn() { }, error() { } };
  // eslint-disable-next-line no-unused-vars
  const publisherStub = sandbox.createStubInstance(AMQPPublisher);
  const logStub = sandbox.stub(log);
  const sampleEvent = 'sample:event';
  const sampleMessage = { sample: 'message' };
  const sampleEndpoint = 'target.endpoint';
  const withRetryDisabled = { publishing: { retry: { enabled: false } } };
  const fakeError = new Error('Oh no! Publishing failed');
  fakeError.statusCode = 429;
  const withCustomRetry = {
    publishing: {
      retry: {
        enabled: true,
        options: {
          timeout: 70,
          // it's max_attempts actually
          max_tries: 3,
          interval: 10,
          backoff: 2,
          max_interval: 40,
          throw_original: true,
          predicate: { statusCode: 429 },
        },
      },
    },
  };

  afterEach(() => {
    sandbox.reset();
    // @todo debug
    // manually reset stub method call counter, sandbox does not do it for some reason
    publisherStub.publish.reset();
  });

  it('should init empty subscriptions map', () => {
    const bus = new EventBus(publisherStub, logStub);

    assert.ok(bus.subscriptions instanceof Map);
    assert.strictEqual(bus.subscriptions.size, 0);
  });

  it('should be able to add subscription', () => {
    const bus = new EventBus(publisherStub, logStub);
    bus.subscribe('some:event', { endpoint: 'first.target.endpoint' });

    assert.strictEqual(bus.subscriptions.size, 1);
    assert.deepStrictEqual(bus.subscriptions.get('some:event'), [{ endpoint: 'first.target.endpoint' }]);

    bus.subscribe('some:event', { endpoint: 'second.target.endpoint' });

    assert.strictEqual(bus.subscriptions.size, 1);
    assert.deepStrictEqual(bus.subscriptions.get('some:event'), [
      { endpoint: 'first.target.endpoint' },
      { endpoint: 'second.target.endpoint' },
    ]);
  });

  it('should resolve publish when there is no such event in subscriptions', async () => {
    const bus = new EventBus(publisherStub, logStub);
    const result = await bus.publish('some:new:event:with:no:subscribers', sampleMessage);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  it('should be able to publish message to a subscriber', async () => {
    publisherStub.publish.resolves({ status: 'let it be ok' });
    const bus = new EventBus(publisherStub, logStub);

    bus.subscribe(sampleEvent, { endpoint: 'first.target.endpoint', ...withRetryDisabled });
    bus.subscribe(sampleEvent, { endpoint: 'second.target.endpoint', ...withRetryDisabled });
    bus.subscribe('another:event', { endpoint: 'should.not.publish', ...withRetryDisabled });

    await bus.publish(sampleEvent, sampleMessage);

    sinon.assert.calledTwice(publisherStub.publish);
    sinon.assert.calledWithExactly(publisherStub.publish.getCall(0), 'first.target.endpoint', sinon.match(sampleMessage));
    sinon.assert.calledWithExactly(publisherStub.publish.getCall(1), 'second.target.endpoint', sinon.match(sampleMessage));
  });

  it('should be able to retry publishing message with undefined publishing config', async () => {
    publisherStub.publish
      .callThrough()
      .withArgs(sampleEndpoint, sinon.match(sampleMessage))
      .onFirstCall().rejects(fakeError)
      .onSecondCall().resolves({ status: 'let it be ok' });

    const bus = new EventBus(publisherStub, logStub);
    bus.subscribe(sampleEvent, { endpoint: sampleEndpoint });

    const result = await bus.publish(sampleEvent, sampleMessage);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].status, 'let it be ok');
    sinon.assert.calledTwice(publisherStub.publish);
    sinon.assert.calledWithExactly(publisherStub.publish.getCall(0), sampleEndpoint, sinon.match(sampleMessage));
    sinon.assert.calledWithExactly(publisherStub.publish.getCall(1), sampleEndpoint, sinon.match(sampleMessage));
  });

  it('should be able to retry publishing message with custom retry config', async () => {
    publisherStub.publish
      .callThrough()
      .withArgs(sampleEndpoint, sinon.match(sampleMessage))
      .onCall(0).rejects(fakeError)
      .onCall(1).rejects(fakeError)
      .onCall(2).resolves({ status: 'let it be ok' });

    const bus = new EventBus(publisherStub, logStub);
    bus.subscribe(sampleEvent, { endpoint: sampleEndpoint, ...withCustomRetry });

    const result = await bus.publish(sampleEvent, sampleMessage);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].status, 'let it be ok');
    sinon.assert.callCount(publisherStub.publish, 3);
    sinon.assert.calledWithExactly(publisherStub.publish.getCall(0), sampleEndpoint, sinon.match(sampleMessage));
    sinon.assert.calledWithExactly(publisherStub.publish.getCall(1), sampleEndpoint, sinon.match(sampleMessage));
    sinon.assert.calledWithExactly(publisherStub.publish.getCall(2), sampleEndpoint, sinon.match(sampleMessage));
  });

  it('should not swallow original error, provide error wrapper instead', async () => {
    const unexpectedError = new Error('Any kind of error');
    publisherStub.publish.rejects(unexpectedError);
    const bus = new EventBus(publisherStub, logStub);
    bus.subscribe(sampleEvent, { endpoint: sampleEndpoint, ...withCustomRetry });

    await assert.rejects(
      bus.publish(sampleEvent, sampleMessage),
      (e) => {
        assert.ok(e instanceof eventBusError.PublishingError);
        assert.deepStrictEqual(e.innerError, unexpectedError);
        assert.strictEqual(e.message, 'Failed to publish event. Any kind of error');
        return true;
      }
    );

    sinon.assert.calledOnceWithExactly(logStub.error, sinon.match({ err: unexpectedError }), sinon.match.string);
  });

  it('should be able to instantiate from config', () => {
    const amqpFake = sandbox.fake();
    const logFake = sandbox.fake();
    const bus = EventBus.fromParams(amqpFake, subscriptions, logFake);

    assert.ok(bus.subscriptions instanceof Map);
    assert.strictEqual(bus.subscriptions.size, 2);
    const success = bus.subscriptions.get('paypal:agreements:billing:success');
    assert.strictEqual(success.length, 1);
    assert.strictEqual(success[0].endpoint, 'ms-billing.paypal.agreements.billing.success');
    assert.strictEqual(success[0].publishing.retry.enabled, false);
    const failure = bus.subscriptions.get('paypal:agreements:billing:failure');
    assert.strictEqual(failure.length, 1);
    assert.strictEqual(failure[0].endpoint, 'ms-billing.paypal.agreements.billing.failure');
    assert.strictEqual(failure[0].publishing.retry.enabled, false);
    assert.strictEqual(bus.subscriptions.get('paypal:transactions:create'), undefined);
  });
});
