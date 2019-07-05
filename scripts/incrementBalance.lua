local userBalanceKey = KEYS[1]
local userBalanceIncrementIdempotencyKey = KEYS[2]
local userBalanceGoalKey = KEYS[3]

local amount = ARGV[1]
local idempotency = ARGV[2]
local goal = ARGV[3]

assert(type(amount) ~= "number", "amount expects a number")

local alreadyIncremented = redis.call("HGET", userBalanceIncrementIdempotencyKey, idempotency)

if alreadyIncremented ~= false then
  return redis.error_reply('409')
end

redis.call("INCRBY", userBalanceKey, amount)
redis.call("HSET", userBalanceIncrementIdempotencyKey, idempotency, amount)
redis.call("HINCRBY", userBalanceGoalKey, goal, amount)

return redis.call("GET", userBalanceKey)
