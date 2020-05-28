local agreementKey = KEYS[1]
local agreementTxListKey = KEYS[2]
local txId = ARGV[1]
local txCounterField = ARGV[2]

local addedTx = redis.call("SADD", agreementTxListKey, txId)

if addedTx ~= 1 then
  return redis.call("HGET", agreementKey, txCounterField)
end

return redis.call("HINCRBY", agreementKey, txCounterField, 1)
