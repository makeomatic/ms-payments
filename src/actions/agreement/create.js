const Promise = require('bluebird');
const Errors = require('common-errors');
const moment = require('moment');
const url = require('url');
const find = require('lodash/find');
const omit = require('lodash/omit');
const debug = require('debug')('nightmare:paypal-plan');

// helpers
const key = require('../../redisKey');
const { PAYPAL_DATE_FORMAT, PLANS_DATA } = require('../../constants');
const { deserialize } = require('../../utils/redis');
const {
  agreement: { create: billingAgreementCreate },
  plan: { create: billingPlanCreate, update: billingPlanUpdate },
  handleError,
  is,
  states: { active },
  blacklistedProps,
} = require('../../utils/paypal');

/**
 * Fetches plan data
 */
function fetchPlan() {
  const { redis, planId } = this;

  return redis
    .hgetall(key(PLANS_DATA, planId))
    .then((data) => {
      if (!data) {
        throw new Errors.HttpStatusError(404, `plan ${planId} not found`);
      }

      return deserialize(data);
    })
    .tap((data) => {
      if (is.active(data) !== true) {
        throw new Errors.HttpStatusError(412, `plan ${planId} is inactive`);
      }
    });
}

/**
 * Sends request to paypal
 * @param  {Object} plan
 */
function sendRequest(rawPlanData) {
  const {
    agreement,
    trialDiscount,
    trialCycle,
  } = this;

  const [subscription] = rawPlanData.subs;
  const regularPayment = subscription.definition.amount;
  const setupFee = { ...regularPayment };

  const planData = {
    ...agreement,
    start_date: moment().add(1, subscription.name).format(PAYPAL_DATE_FORMAT),
    override_merchant_preferences: {
      setup_fee: setupFee,
      initial_fail_amount_action: 'CANCEL',
      max_fail_attempts: 3,
    },
  };

  return Promise.try(() => {
    // if we grant a discount - create plan with it now
    const normalizedTrialCycle = subscription.name === 'year'
      ? Math.ceil(trialCycle / 12) - 1
      : trialCycle - 1;

    if (trialDiscount === 0) {
      return planData.plan.id;
    }

    setupFee.value = Number(regularPayment.value * ((100 - trialDiscount) / 100)).toFixed(2);

    if (normalizedTrialCycle === 0) {
      return planData.plan.id;
    }

    // compose trial plan
    const trialPlan = omit(rawPlanData.plan, blacklistedProps);
    const paymentDefinitions = trialPlan.payment_definitions;
    const regularDefinition = paymentDefinitions[0];
    const trialDefinition = {
      ...regularDefinition,
      type: 'TRIAL',
      cycles: normalizedTrialCycle,
      amount: { ...setupFee },
    };

    trialPlan.name = `${trialPlan.name}-${trialDiscount}`;
    trialPlan.payment_definitions = [trialDefinition, regularDefinition];

    return billingPlanCreate(trialPlan, this.config.paypal)
      .get('id')
      .tap(planId => (
        billingPlanUpdate(planId, [{ op: 'replace', path: '/', value: { state: active } }], this.config.paypal)
      ))
      .catch(handleError);
  })
  .then((planId) => {
    planData.plan.id = planId;
    debug('init plan %j', planData);

    return billingAgreementCreate(planData, this.config.paypal)
      .catch(handleError)
      .then((newAgreement) => {
        const approval = find(newAgreement.links, { rel: 'approval_url' });
        if (approval === null) {
          throw new Errors.NotSupportedError('Unexpected PayPal response!');
        }

        const token = url.parse(approval.href, true).query.token;
        return {
          token,
          url: approval.href,
          agreement: newAgreement,
        };
      });
  });
}

/**
 * Sets token for later approval
 * @param {Object} response
 */
function setToken(response) {
  const tokenKey = key('subscription-token', response.token);
  const { owner, planId, redis } = this;

  // during trial original plan id is returned, however, payment model is different
  return redis
    .pipeline()
    .hmset(tokenKey, { planId, owner })
    .expire(tokenKey, 3600 * 24)
    .exec()
    .return(response);
}

/**
 * @api {amqp} <prefix>.agreement.create Creates agreement for approval
 * @apiVersion 1.0.0
 * @apiName createAgreement
 * @apiGroup Agreement
 *
 * @apiDescription Creates agreement for approval through paypal and sends link back
 *
 * @apiParam (Payload) {Object} agreement agreement data
 * @apiParam (Payload) {Object} agreement.plan plan data
 * @apiParam (Payload) {String} agreement.plan.id plan id
 * @apiParam (Payload) {String} owner user, for which we create the agreement for
 * @apiParam (Payload) {Number{0..100}=0} [trialDiscount] defines discount for a trial period
 * @apiParam (Payload) {Number{0..}=12} [trialCycle] cycle for trial payments
 */
module.exports = function agreementCreate({ params }) {
  const { config, redis } = this;
  const { owner, agreement, trialDiscount, trialCycle } = params;
  const { plan: { id: planId } } = agreement;

  const ctx = {
    // basic data
    config,
    redis,

    // input params
    planId,
    owner,
    agreement,
    trialDiscount,
    trialCycle,
  };

  return Promise
    .bind(ctx)
    .then(fetchPlan)
    .then(sendRequest)
    .then(setToken);
};
