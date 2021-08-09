const get = require('get-value');

const key = require('../../../redis-key');
const { hmget } = require('../../../list-utils');
const { AGREEMENT_DATA } = require('../../../constants');
const { mergeWithNotNull } = require('../../plans');
const { serialize } = require('../../redis');
const error = require('./error');

const AGREEMENT_KEYS = ['agreement', 'plan', 'owner', 'state'];
const agreementParser = hmget(AGREEMENT_KEYS, JSON.parse, JSON);

const kBannedStates = ['cancelled', 'suspended'];

const verifyAgreementState = (id, owner, state, creatorTaskId) => {
  if (!state || kBannedStates.includes(state.toLowerCase())) {
    throw new error.AgreementStatusError(id, owner, state.toLowerCase(), creatorTaskId);
  }
};

/**
 * Parses and completes agreement data retrieved from redis
 * @param  {Object} service - current microfleet
 * @param  {String} id - agreement id
 * @return {Object} agreement
 * @throws DataError When agreement data cannot be parsed
 */
async function getStoredAgreement(service, id) {
  const { redis, log } = service;
  const agreementKey = key(AGREEMENT_DATA, id);
  const data = await redis.hmget(agreementKey, AGREEMENT_KEYS);

  try {
    const parsed = agreementParser(data);
    // NOTE: PAYPAL agreement doesn't have embedded plan id and owner...
    parsed.agreement.owner = parsed.owner;
    parsed.agreement.plan.id = parsed.plan;

    return parsed;
  } catch (e) {
    log.error({
      err: e, keys: AGREEMENT_KEYS, source: String(data), agreementKey,
    }, 'failed to fetch agreement data');

    throw e;
  }
}

async function updateAgreement(service, oldAgreement, newAgreement, extra) {
  const agreementKey = key(AGREEMENT_DATA, newAgreement.id);
  await service.redis.hmset(agreementKey, serialize({
    agreement: {
      ...newAgreement,
      plan: mergeWithNotNull(get(oldAgreement, ['agreement', 'plan']), newAgreement.plan),
    },
    state: newAgreement.state,
    ...extra,
  }));
}

module.exports = {
  verifyAgreementState,
  getStoredAgreement,
  updateAgreement,
  error,
};
