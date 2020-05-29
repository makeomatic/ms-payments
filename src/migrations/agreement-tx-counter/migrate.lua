local AGREEMENT_DATA = KEYS[2]
local PER_AGREEMENT_TX_IDX = KEYS[3]
local AGREEMENT_TRANSACTIONS_INDEX = KEYS[4]
local AGREEMENT_TRANSACTIONS_DATA = KEYS[5]

local AGR_TX_FIELD = ARGV[1]
local ARG_AGR_ID_FIELD = ARGV[2]

-- step 1. get all transaction ids
local txIds = redis.call("SMEMBERS", AGREEMENT_TRANSACTIONS_INDEX)

local function isempty(s)
  return s == nil or s == '' or s == false;
end

-- step 2. iterate over every tx
for i,txId in pairs(txIds) do
  -- retrieve associated agreement id
  local txDataKey = AGREEMENT_TRANSACTIONS_DATA .. ":" .. txId
  local encodedAgreementId = redis.call("HGET", txDataKey, ARG_AGR_ID_FIELD)

  -- no data for some reason - skip this
  if isempty(encodedAgreementId) == false then
    local agreementId = cjson.decode(encodedAgreementId)
    local agreementKey = AGREEMENT_DATA .. ":" .. agreementId
    local perAgreementTxIdxKey = PER_AGREEMENT_TX_IDX .. ":" .. agreementId

    -- if we are storing this for the first time - increment tx count by 1
    if redis.call("SADD", perAgreementTxIdxKey, txId) == 1 then
      redis.call("HINCRBY", agreementKey, AGR_TX_FIELD, 1)
    end
  end
end

