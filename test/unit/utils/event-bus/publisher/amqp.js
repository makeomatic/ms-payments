const sinon = require('sinon');
const { AMQPPublisher } = require('../../../../../src/utils/event-bus/publisher');

describe('AMQP Publisher', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.reset());

  const logFake = sandbox.fake();
  const amqpStub = sinon.stub({ publishAndWait: async () => {} });

  it('should be able to publish', async () => {
    amqpStub.publishAndWait.resolves();
    const publisher = new AMQPPublisher(amqpStub, logFake);
    await publisher.publish('route', { some: 'message' });

    sandbox.assert.calledOnceWithExactly(
      amqpStub.publishAndWait,
      'route',
      sinon.match({ some: 'message' }),
      sinon.match({
        confirm: true,
        mandatory: true,
        deliveryMode: 2,
      })
    );
  });
});
