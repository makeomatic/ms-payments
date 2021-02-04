const assert = require('assert');
const { error: { PublishingError } } = require('../../../../../src/utils/event-bus');

describe('Publishing error', () => {
  it('Should be able to instantiate', () => {
    const inner = new Error('Smth went wrong');
    const publishingError = new PublishingError(inner);
    assert.ok(publishingError.innerError instanceof Error);
    assert.strictEqual(publishingError.message, 'Failed to publish event. Smth went wrong');
    assert.ok(publishingError.stack.length);
  });
});
