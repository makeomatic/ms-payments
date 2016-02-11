const JSONParse = JSON.parse;
const JSONStringify = JSON.stringify;
const reduce = require('lodash/reduce');
const calcSlot = require('ioredis/lib/utils').calcSlot;

function reducer(accumulator, value, key) {
  if (value !== undefined) {
    accumulator[key] = JSONStringify(value); // eslint-disable-line new-cap
  }

  return accumulator;
}

function expander(accumulator, value, key) {
  if (Buffer.isBuffer(value) && value.length === 0) {
    return accumulator;
  }

  accumulator[key] = value ? JSONParse(value) : value; // eslint-disable-line new-cap
  return accumulator;
}

exports.serialize = function serialize(object) {
  return reduce(object, reducer, {});
};

exports.deserialize = function deserialize(object) {
  return reduce(object, expander, {});
};

exports.calcSlot = calcSlot;
