const assert = require('assert');

describe('Payments dummy suite', () => {
  it('Should be able to require payments', () => {
    assert.ok(require('../../src/payments'));
  });
});
