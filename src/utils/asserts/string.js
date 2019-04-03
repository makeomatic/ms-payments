const { strictEqual } = require('assert');
const isString = require('lodash/isString');

module.exports = function assertString(value, error) {
  strictEqual(isString(value), true, error);
};
