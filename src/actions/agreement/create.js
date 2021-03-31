const Errors = require('common-errors');
const moment = require('moment');
const { omit, find } = require('lodash');
const url = require('url');
const { ActionTransport } = require('@microfleet/core');

const key = require('../../redis-key');
const { serialize, deserialize } = require('../../utils/redis');
const {
  agreement: { create: billingAgreementCreate },
  plan: { create: billingPlanCreate, update: billingPlanUpdate },
  handleError,
  is,
  states: { active },
  blacklistedProps,
} = require('../../utils/paypal');

const { PLANS_DATA, PAYPAL_DATE_FORMAT } = require('../../constants');

async function fetchPlan(redis, planId) {
  const data = await redis.hgetall(key(PLANS_DATA, planId));

  if (!data) {
    throw new Errors.HttpStatusError(404, `plan ${planId} not found`);
  }

  const plan = deserialize(data);
  if (is.active(plan) !== true) {
    throw new Errors.HttpStatusError(412, `plan ${planId} is inactive`);
  }

  return plan;
}

function calculateDiscounts(subscription, trialDiscount, trialCycle) {
  const regularPayment = subscription.definition.amount;
  const setupFee = { ...regularPayment };
  const normalizedTrialCycle = subscription.name === 'year'
    ? Math.ceil(trialCycle / 12) - 1
    : trialCycle - 1;

  if (trialDiscount !== 0) {
    setupFee.value = Number(regularPayment.value * ((100 - trialDiscount) / 100)).toFixed(2);
  }

  return {
    trialCycle: normalizedTrialCycle,
    trialDiscount,
    setupFee,
  };
}

function prepareTrialPlanData(basePlan, discountParams) {
  const trialPlan = omit(basePlan, blacklistedProps);
  const paymentDefinitions = trialPlan.payment_definitions;
  // copy basic payment definition
  const regularDefinition = omit(paymentDefinitions[0], ['id', 'charge_models']);
  // set to uppercase as paypal requests
  regularDefinition.frequency = regularDefinition.frequency.toUpperCase();

  const trialDefinition = {
    ...regularDefinition,
    type: 'TRIAL',
    cycles: discountParams.trialCycle,
    amount: { ...discountParams.setupFee },
  };

  trialPlan.name = `${trialPlan.name}-${discountParams.trialDiscount}`;
  trialPlan.payment_definitions = [trialDefinition, regularDefinition];

  return trialPlan;
}

async function prepareBillingParams(redis, log, paypalConfig, agreementParams) {
  const { planId, trialDiscount, trialCycle } = agreementParams;
  const planData = await fetchPlan(redis, planId);

  const [subscription] = planData.subs;
  const calculated = calculateDiscounts(subscription, trialDiscount, trialCycle);

  if (calculated.trialCycle === 0) {
    return {
      planId: planData.plan.id,
      setupFee: calculated.setupFee,
      subscription,
    };
  }

  let trialPlanId;
  const trialPlanData = prepareTrialPlanData(planData.plan, calculated);
  log.info({ trialPlanData }, 'init discounted plan');

  try {
    const trialPlan = await billingPlanCreate(trialPlanData, paypalConfig);
    ({ id: trialPlanId } = trialPlan);

    await billingPlanUpdate(trialPlanId, [{ op: 'replace', path: '/', value: { state: active } }], paypalConfig);
  } catch (e) {
    handleError(e);
  }

  return {
    planId: trialPlanId,
    setupFee: calculated.setupFee,
    subscription,
  };
}

function prepareAgreementData(agreementBase, params) {
  const { planId, setupFee, subscription, startDate } = params;

  const agreementData = {
    ...agreementBase,
    start_date: moment(startDate).add(1, subscription.name).format(PAYPAL_DATE_FORMAT),
    override_merchant_preferences: {
      setup_fee: setupFee,
      initial_fail_amount_action: 'CANCEL',
      max_fail_attempts: 3,
    },
  };

  // assign new plan id
  agreementData.plan.id = planId;

  return agreementData;
}

async function saveAgreement(redis, agreementData, params) {
  const tokenKey = key('subscription-token', agreementData.token);
  const { owner, planId } = params;
  const { plan } = agreementData.agreement;
  const data = {
    planId, owner, plan,
  };

  // during trial original plan id is returned, however, payment model is different
  return redis
    .pipeline()
    .hmset(tokenKey, serialize(data))
    .expire(tokenKey, 3600 * 24)
    .exec();
}

/**
 * @api {amqp} <prefix>.agreement.create Create agreement
 * @apiVersion 1.0.0
 * @apiName createAgreement
 * @apiGroup Agreement
 *
 * @apiDescription Creates agreement for approval through paypal and sends link back
 *
 * @apiSchema {jsonschema=agreement/create.json} apiRequest
 * @apiSchema {jsonschema=response/agreement/create.json} apiResponse
 */
async function agreementCreate({ params }) {
  const { config, redis, log } = this;
  const {
    owner, agreement, trialDiscount, trialCycle, startDate,
  } = params;
  const { plan: { id: planId } } = agreement;
  const logger = log.child({ owner });

  const billingParams = await prepareBillingParams(redis, logger, config.paypal, {
    planId, trialDiscount, trialCycle, startDate,
  });
  const agreementData = prepareAgreementData(agreement, { ...billingParams, startDate });
  const createdAgreement = await billingAgreementCreate(agreementData, config.paypal)
    .catch(handleError);

  const approval = find(createdAgreement.links, { rel: 'approval_url' });
  if (approval === null) {
    throw new Errors.NotSupportedError('Unexpected PayPal response!');
  }

  const { token } = url.parse(approval.href, true).query;
  const createdAgreementData = {
    token,
    url: approval.href,
    agreement: createdAgreement,
  };
  await saveAgreement(redis, createdAgreementData, { owner, planId });

  return createdAgreementData;
}

agreementCreate.transports = [ActionTransport.amqp];

module.exports = agreementCreate;
