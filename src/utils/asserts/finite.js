const { strictEqual } = require('assert');
const isFinite = require('lodash/isFinite');

module.exports = function assertFinite(value, error) {
  strictEqual(isFinite(value), true, error);
};
