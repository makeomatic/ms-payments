const Promise = require('bluebird');
// const paypal = require('paypal-rest-sdk');

function planList(opts) {
  const { redis } = this;
  const { owner, filter } = opts;
  const criteria = opts.criteria || 'startedAt';
  const strFilter = typeof filter === 'string' ? filter : JSON.stringify(filter || {});
  const order = opts.order || 'ASC';
  const offset = opts.offset || 0;
  const limit = opts.limit || 10;

  return redis
    .sortedFilteredFilesList('plans-index', 'plans-data:*', criteria, order, strFilter, offset, limit)
    .then((planIds) => {
      const length = +planIds.pop();
      if (length === 0 || planIds.length === 0) {
        return [
          planIds || [],
          [],
          length,
        ];
      }

      const pipeline = redis.pipeline();
      planIds.forEach(planId => {
        pipeline.hgetall(`plans-data:${planId}`);
      });

      return Promise.join(
        planIds,
        pipeline.exec(),
        length
      );
    })
    .spread((planIds, props, length) => {
      const files = planIds.map(function remapData(planId, idx) {
        return props[idx][1];
      });

      return {
        files,
        cursor: offset + limit,
        page: Math.floor(offset / limit + 1),
        pages: Math.ceil(length / limit),
      };
    });
}

module.exports = planList;
