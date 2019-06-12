const { strictEqual } = require('assert');
const isPlainObject = require('lodash/isPlainObject');

module.exports = function assertPlainObject(value, error) {
  strictEqual(isPlainObject(value), true, error);
};
