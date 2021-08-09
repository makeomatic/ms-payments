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

function calculateDiscounts(subscription, customSetupFee, skipSetupFee, trialDiscount, trialCycle) {
  const regularPayment = { ...subscription.definition.amount };
  const setupFee = { ...regularPayment };
  const extractCycle = skipSetupFee ? 0 : 1;
  const normalizedTrialCycle = subscription.name === 'year'
    ? Math.ceil(trialCycle / 12) - extractCycle
    : trialCycle - extractCycle;

  const overridenSetupFee = customSetupFee
    ? { ...setupFee, value: skipSetupFee ? '0' : customSetupFee }
    : setupFee;

  if (trialDiscount !== 0) {
    regularPayment.value = Number(regularPayment.value * ((100 - trialDiscount) / 100)).toFixed(2);
  }

  return {
    trialCycle: normalizedTrialCycle,
    trialDiscount,
    setupFee: overridenSetupFee,
    regularPayment,
    skipSetupFee,
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
    amount: { ...discountParams.regularPayment },
  };

  trialPlan.name = `${trialPlan.name}-${discountParams.trialDiscount}`;
  trialPlan.payment_definitions = [trialDefinition, regularDefinition];

  return trialPlan;
}

async function createAndActivatePlan(planData, paypalConfig) {
  let newPlan;
  try {
    newPlan = await billingPlanCreate(planData, paypalConfig);
    await billingPlanUpdate(newPlan.id, [{ op: 'replace', path: '/', value: { state: active } }], paypalConfig);
  } catch (e) {
    handleError(e);
  }

  return newPlan;
}

async function prepareBillingParams(redis, log, paypalConfig, agreementParams) {
  const { planId, trialDiscount, trialCycle, setupFee, skipSetupFee } = agreementParams;
  const planData = await fetchPlan(redis, planId);

  const [subscription] = planData.subs;
  const calculated = calculateDiscounts(subscription, setupFee, skipSetupFee, trialDiscount, trialCycle);

  if (calculated.trialCycle === 0 || calculated.trialDiscount === 0) {
    return {
      planId: planData.plan.id,
      setupFee: calculated.setupFee,
      skipSetupFee,
      subscription,
    };
  }

  const trialPlanData = prepareTrialPlanData(planData.plan, calculated);
  log.info({ trialPlanData }, 'init discounted plan');

  const { id: trialPlanId } = await createAndActivatePlan(trialPlanData, paypalConfig);

  return {
    planId: trialPlanId,
    setupFee: calculated.setupFee,
    subscription,
    skipSetupFee,
  };
}

function prepareAgreementData(agreementBase, params) {
  const { planId, setupFee, subscription, startDate, skipSetupFee } = params;

  // Possible problem, we should remeber that Paypal requires startDate to be less than now - 24h
  // https://developer.paypal.com/docs/api/payments.billing-agreements/v1/#billing-agreements
  const finalStartDate = skipSetupFee === true
    ? moment(startDate).format(PAYPAL_DATE_FORMAT)
    : moment(startDate).add(1, subscription.name).format(PAYPAL_DATE_FORMAT);

  const agreementData = {
    ...agreementBase,
    start_date: finalStartDate,
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

async function createAgreement(agreementData, paypalConfig) {
  let newAgreement;

  try {
    newAgreement = await billingAgreementCreate(agreementData, paypalConfig);
  } catch (e) {
    handleError(e);
  }

  return newAgreement;
}

async function saveAgreement(redis, agreementData, params) {
  const tokenKey = key('subscription-token', agreementData.token);
  const { owner, planId } = params;
  const { plan } = agreementData.agreement;
  const data = {
    planId, owner, plan, creatorTaskId: agreementData.creatorTaskId,
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
    setupFee, skipSetupFee, creatorTaskId,
  } = params;
  const { plan: { id: planId } } = agreement;
  const logger = log.child({ owner });

  const billingParams = await prepareBillingParams(redis, logger, config.paypal, {
    planId, trialDiscount, trialCycle, setupFee, skipSetupFee,
  });

  const agreementData = prepareAgreementData(agreement, { ...billingParams, startDate });
  const createdAgreement = await createAgreement(agreementData, config.paypal);

  const approval = find(createdAgreement.links, { rel: 'approval_url' });
  if (approval === null) {
    throw new Errors.NotSupportedError('Unexpected PayPal response!');
  }

  const { token } = url.parse(approval.href, true).query;
  const createdAgreementData = {
    token,
    url: approval.href,
    agreement: createdAgreement,
    creatorTaskId,
  };
  await saveAgreement(redis, createdAgreementData, { owner, planId });

  return createdAgreementData;
}

agreementCreate.transports = [ActionTransport.amqp];

module.exports = agreementCreate;
