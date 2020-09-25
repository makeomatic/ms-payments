const { ActionTransport } = require('@microfleet/core');
const Promise = require('bluebird');
const { HttpStatusError } = require('bluebird');

// helpers
const key = require('../../redis-key');
const { cleanupCache } = require('../../list-utils');
const {
  PLANS_DATA, PLANS_INDEX, FREE_PLAN_ID, PLAN_ALIAS_FIELD,
} = require('../../constants');

function deleteFromRedis(id, redis) {
  // and delete plan from redis
  const planKey = key(PLANS_DATA, id);
  const pipeline = redis.pipeline();

  return redis.hget(planKey, PLAN_ALIAS_FIELD).then((alias) => {
    const aliasedId = alias && alias.length > 0 ? JSON.parse(alias) : id;

    pipeline.del(planKey);
    pipeline.srem(PLANS_INDEX, id);

    if (aliasedId !== id) {
      pipeline.srem(PLANS_INDEX, aliasedId);
      pipeline.del(key(PLANS_DATA, aliasedId));
    }

    return pipeline.exec();
  });
}

async function actualDelete(id) {
  const { redis } = this;

  if (id.indexOf('|') === -1) {
    await this.dispatch('plan.state', { params: { id, state: 'inactive' } });
  }

  await deleteFromRedis(id, redis);
}

/**
 * @api {amqp} <prefix>.plan.delete Delete plan
 * @apiVersion 1.0.0
 * @apiName planDelete
 * @apiGroup Plan
 *
 * @apiDescription Deletes plan
 *
 * @apiSchema {jsonschema=plan/create.json} apiRequest
 * @apiSchema {jsonschema=response/plan/create.json} apiResponse
 */
function planDelete({ params: id }) {
  if (id === FREE_PLAN_ID) {
    return Promise.reject(new HttpStatusError(400, 'unable to delete free plan'));
  }

  const ids = id.split('|');
  if (ids.length > 1) {
    ids.push(id); // also delete full id
  }

  return Promise
    .bind(this, ids)
    .map(actualDelete)
    .return(PLANS_INDEX)
    .then(cleanupCache);
}

planDelete.transports = [ActionTransport.amqp];

module.exports = planDelete;
