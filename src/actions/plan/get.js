const { ActionTransport } = require('@microfleet/core');
const Errors = require('common-errors');
const is = require('is');

// helpers
const key = require('../../redis-key');
const { hmget } = require('../../list-utils');
const { PLANS_DATA, PLAN_ALIAS_FIELD } = require('../../constants');
const { handlePipeline } = require('../../utils/redis');

// constants
const EXTRACT_FIELDS = [PLAN_ALIAS_FIELD, 'plan', 'subs', 'hidden', 'meta', 'level', 'year', 'month'];
const responseParser = hmget(EXTRACT_FIELDS, JSON.parse, JSON, null);

/**
 * Helper to retrieve plan
 * @param  {Redis} redis
 * @param  {String} id
 * @param  {Boolean} [fetchParent=false]
 * @returns {Promise<*>}
 */
function retrievePlan(redis, id, fetchParent = false) {
  const planKey = key(PLANS_DATA, id);

  return redis
    .pipeline()
    .exists(planKey)
    .hmget(planKey, EXTRACT_FIELDS)
    .exec()
    .then(handlePipeline)
    .spread((exists, data) => {
      if (!exists) {
        throw new Errors.HttpStatusError(404, `plan ${id} not found`);
      }

      // data[0] === unparsed alias
      const alias = data[0] && JSON.parse(data[0]);
      if (fetchParent === true && alias && alias !== id) {
        // set fetchParent to false and try fetching plan using alias
        return retrievePlan(redis, alias);
      }

      return responseParser(data);
    });
}

/**
 * @api {amqp, internal} <prefix>.plan.get Get Plan
 * @apiVersion 1.0.0
 * @apiName planGet
 * @apiGroup Plan
 *
 * @apiDescription Retrieves plan or parent plan by its id.
 *
 * @apiSchema {jsonschema=plan/get.json} apiRequest
 * @apiSchema {jsonschema=response/plan/get.json} apiResponse
 */
function planGet({ params }) {
  let id;
  let fetchParent = false;

  if (is.string(params)) {
    id = params;
  } else {
    /* eslint-disable prefer-destructuring */
    id = params.id;
    fetchParent = params.fetchParent;
    /* eslint-enable prefer-destructuring */
  }

  return retrievePlan(this.redis, id, fetchParent);
}

planGet.transports = [ActionTransport.amqp, ActionTransport.internal];

module.exports = planGet;
