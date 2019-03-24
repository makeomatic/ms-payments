const fsort = require('redis-filtered-sort');

// helpers
const { processResult, mapResult } = require('../../list-utils');
const { AGREEMENT_DATA, AGREEMENT_INDEX } = require('../../constants');
const key = require('../../redis-key');

function planList({ params: opts }) {
  const { redis } = this;
  const { filter, owner, criteria } = opts;
  const strFilter = typeof filter === 'string' ? filter : fsort.filter(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  let index = AGREEMENT_INDEX;
  if (owner) {
    index = key(index, owner);
  }

  return redis
    .fsort(index, key(AGREEMENT_DATA, '*'), criteria, order, strFilter, Date.now(), offset, limit)
    .then(processResult(AGREEMENT_DATA, redis))
    .spread(mapResult(offset, limit));
}

module.exports = planList;
