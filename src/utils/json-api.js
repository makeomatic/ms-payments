const pick = require('lodash/pick');
const omit = require('lodash/omit');

const assertStringNotEmpty = require('./asserts/string-not-empty');

const CHARGE_RESPONSE_FIELDS = ['id', 'amount', 'description', 'status', 'createAt', 'owner', 'failReason'];

function balance(id, value) {
  return {
    data: {
      type: 'balance',
      id,
      attributes: {
        value,
      },
    },
  };
}

function chargeMapper(data, replacement) {
  assertStringNotEmpty(replacement.owner, 'replacement for owner is required');

  if (data === null) {
    return data;
  }

  const attributes = omit(pick(data, CHARGE_RESPONSE_FIELDS), ['id']);

  return {
    id: data.id,
    type: 'charge',
    attributes: Object.assign(attributes, replacement),
  };
}

function chargeCollectionMapper(data) {
  return chargeMapper(data, this);
}

function charge(data, replacement) {
  return {
    data: chargeMapper(data, replacement),
  };
}

function chargeCollection(data, replacement, total, limit, offset) {
  return {
    meta: {
      offset,
      limit,
      cursor: offset + limit,
      page: Math.floor(offset / limit) + 1,
      pages: Math.ceil(total / limit) },
    data: data.map(chargeCollectionMapper, replacement),
  };
}

module.exports = {
  CHARGE_RESPONSE_FIELDS,
  balance,
  charge,
  chargeCollection,
};
