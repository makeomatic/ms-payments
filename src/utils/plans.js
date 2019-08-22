const { isArray } = Array;
const get = require('get-value');
const mergeWith = require('lodash/mergeWith');
const isNull = require('lodash/isNull');
const compact = require('lodash/compact');

function merger(planOneData, planTwoData, fieldName) {
  if (fieldName === 'id') {
    return compact([planOneData, planTwoData]).join('|');
  }

  if (isArray(planOneData) && isArray(planTwoData)) {
    return planOneData.concat(planTwoData);
  }

  return undefined;
}

exports.merger = merger;

exports.createJoinPlans = function createJoinPlans(message) {
  return function joinPlans(plans) {
    return {
      plan: mergeWith({}, ...plans, { name: message.plan.name }, merger),
      plans,
    };
  };
};

exports.mergeWithNotNull = function mergeWithNotNull(oldPlan, newPlan) {
  const valuesToMerge = {
    payment_definitions: get(oldPlan, 'payment_definitions', null),
    merchant_preferences: get(oldPlan, 'merchant_preferences', null),
  };

  return mergeWith({}, valuesToMerge, newPlan, (objValue, srcValue) => {
    if (!isNull(objValue) && isNull(srcValue)) {
      return objValue;
    }

    return undefined;
  });
};
