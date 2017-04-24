const JSONParse = JSON.parse;
const JSONStringify = JSON.stringify;
const { RedisError } = require('common-errors').data;
const reduce = require('lodash/reduce');
const calcSlot = require('cluster-key-slot');

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

/**
 * Handles ioredis pipeline.exec() error
 */
function responseIterator(data, idx) {
  const [err, res] = data;
  if (err) {
    this.errors.push(err);
  }

  // collect response no matter what
  this.response[idx] = res;
}

exports.handlePipeline = function handlePipelineError(args) {
  const errors = [];
  const response = new Array(args.length);
  args.forEach(responseIterator, { errors, response });

  if (errors.length > 0) {
    const message = errors.map(err => err.message).join('; ');
    throw new RedisError(message);
  }

  return response;
};
