const assert = require('assert');
const sinon = require('sinon');
const { simpleDispatcher, duration } = require('../../utils');

describe('Publish hook action', function PublishHookSuite() {
  this.timeout(duration);

  const Payments = require('../../../src');
  const sandbox = sinon.createSandbox();
  let payments;
  let dispatch;
  const SAMPLE_EVENT = 'sample:event';
  const SAMPLE_SUBSCRIBER_ENDPOINT = 'sample.subscriber.endpoint';
  const SAMPLE_EVENT_SUBSCRIBER_CONFIG = { endpoint: SAMPLE_SUBSCRIBER_ENDPOINT, publishing: { retry: { enabled: false } } };

  before('start service', async () => {
    payments = new Payments({ subscriptions: { events: {
      [SAMPLE_EVENT]: SAMPLE_EVENT_SUBSCRIBER_CONFIG,
    } } });
    await payments.connect();
    dispatch = simpleDispatcher(payments);
  });

  after('stop service', async () => {
    await payments.close();
    payments = null;
    dispatch = null;
  });

  afterEach('setup sandbox', () => {
    sandbox.reset();
    sandbox.restore();
  });

  it('Should validate request params', async () => {
    const request = dispatch('payments.hook.publish', { shmevent: 'a', schmeload: {} });
    const error = {
      status_code: 400,
      status: 400,
      name: 'HttpStatusError',
      message: 'hook.publish validation failed: data should NOT have additional properties, '
        + 'data should NOT have additional properties, data should have required property \'event\', '
        + 'data should have required property \'payload\'',
    };

    await assert.rejects(request, error);
  });

  it('Should be able to send event to subscriber', async () => {
    const publishAndWaitStub = sandbox.stub(payments.amqp, 'publishAndWait');
    // stub only subscriber endpoint, call through for the others
    publishAndWaitStub
      .withArgs(SAMPLE_SUBSCRIBER_ENDPOINT, sinon.match.any, sinon.match.any)
      .resolves('ok');
    publishAndWaitStub.callThrough();

    const result = await dispatch(
      'payments.hook.publish',
      { event: SAMPLE_EVENT, payload: { some: 'payload' } }
    );

    assert.ok(result);

    sinon.assert.calledWithExactly(
      publishAndWaitStub.getCalls().filter(({ firstArg }) => firstArg === SAMPLE_SUBSCRIBER_ENDPOINT)[0],
      SAMPLE_SUBSCRIBER_ENDPOINT,
      sinon.match({
        meta: sinon.match({ type: SAMPLE_EVENT }),
        data: sinon.match({ some: 'payload' }),
      }),
      sinon.match({
        confirm: true,
        mandatory: true,
        deliveryMode: 2,
      })
    );
  });
});
