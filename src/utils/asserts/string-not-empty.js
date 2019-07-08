const { strictEqual } = require('assert');
const isString = require('lodash/isString');

module.exports = function assertStringNotEmpty(value, error) {
  strictEqual(isString(value), true, error);
  strictEqual(value.length !== 0, true, error);
};
