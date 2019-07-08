const { strictEqual } = require('assert');

module.exports = function assertArray(value, error) {
  strictEqual(Array.isArray(value), true, error);
};
