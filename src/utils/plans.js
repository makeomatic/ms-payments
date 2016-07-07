const isArray = Array.isArray;
const mergeWith = require('lodash/mergeWith');
const compact = require('lodash/compact');

function merger(planOneData, planTwoData, fieldName) {
  if (fieldName === 'id') {
    return compact([planOneData, planTwoData]).join('|');
  }

  if (isArray(planOneData) && isArray(planTwoData)) {
    return planOneData.concat(planTwoData);
  }

  return void 0;
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
