const Promise = require('bluebird');
const paypal = require('paypal-rest-sdk');
const key = require('../../redisKey.js');
const ld = require('lodash');

function planCreate(message) {
  const { _config, redis } = this;
  const promise = Promise.bind(this);

  function sendRequest() {
    const create = Promise.promisify(paypal.billingPlan.create, { context: paypal.billingPlan });
    // divide single plan definition into as many as payment_definitions present
    const plans = message.plan.payment_definitions.map((definition) => {
      const plan = ld.assign(ld.cloneDeep(message.plan), {
        name: message.plan.name + ' - ' + definition.frequency,
        payment_definitions: [definition],
      });
      return create(plan, _config.paypal);
    });

    return Promise.all(plans);
  }

  function joinPlans(plans) {
    // join plan_definitions of created plans
    const merger = (a, b, k) => {
      if (k === 'id') {
        return a + '|' + b;
      }
      if (ld.isArray(a) && ld.isArray(b)) {
        return a.concat(b);
      }
    };
    const args = plans.concat([merger]);
    return {
      plan: ld.merge.apply(ld, args),
      plans,
    };
  }

  function saveToRedis(data) {
    const { plan, plans } = data;
    const pipeline = redis.pipeline();
    const planKey = key('plans-data', plan.id);
    const plansData = ld.reduce(plans, (a, p) => {
      const frequency = p.payment_definitions[0].frequency;
      a[frequency] = p.id;
      return a;
    }, { full: plan.id });
    const plansKeys = ld.values(plansData);

    const subscriptions = ld.map(message.subscriptions, (subscription) => {
      subscription.definition = ld.findWhere(plan.payment_definitions, { name: subscription.name });
      return subscription;
    });

    const saveDataFull = {
      plan: {
        ...plan,
        hidden: message.hidden,
      },
      subs: subscriptions,
      type: plan.type,
      state: plan.state,
      name: plan.name,
      hidden: message.hidden,
      ...plansData,
    };

    if (message.alias !== null && message.alias !== undefined) {
      saveDataFull.alias = message.alias;
    }

    pipeline.hmset(planKey, ld.mapValues(saveDataFull, JSON.stringify, JSON));

    ld.forEach(plans, (p) => {
      const saveData = {
        plan: {
          ...p,
          hidden: message.hidden,
        },
        subs: subscriptions,
        type: p.type,
        state: p.state,
        name: p.name,
        hidden: message.hidden,
        ...plansData,
      };

      if (message.alias !== null && message.alias !== undefined) {
        saveData.alias = message.alias;
      }

      pipeline.hmset(planKey, ld.mapValues(saveData, JSON.stringify, JSON));
    });

    ld.forEach(plansKeys, (id) => { pipeline.sadd('plans-index', id); });

    return pipeline.exec().return(plan);
  }

  if (message.alias === 'free') {
    // this is a free plan, don't put it on paypal
    message.plan.id = 'free';
    return promise.return(message.plan).then(saveToRedis);
  }

  return promise.then(sendRequest).then(joinPlans).then(saveToRedis);
}

module.exports = planCreate;
