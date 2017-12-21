const Errors = require('common-errors');
const is = require('is');

// helpers
const key = require('../../redisKey');
const { hmget } = require('../../listUtils');
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
 * @api {amqp} <prefix>.plan.get Retrieves Plan by its Id.
 * @apiVersion 1.0.0
 * @apiName retrievePlan
 * @apiGroup Plan
 *
 * @apiDescription Retrieves plan or parent plan by its id.
 *
 * @apiParam (Payload_v1) {String} params - id of the plan
 * @apiParam (Payload_v2) {Object} params - data container
 * @apiParam (Payload_v2) {String} params.id - id of the plan
 * @apiParam (Payload_v2) {Boolean} params.fetchParent - whether to try retrieving parent plan
 */
module.exports = function planGet({ params }) {
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
};
