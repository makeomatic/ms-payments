const { strictEqual } = require('assert');
const isInteger = require('lodash/isInteger');

module.exports = function assertInteger(value, error) {
  strictEqual(isInteger(value), true, error);
};
