local userBalanceKey = KEYS[1]
local userBalanceDecrementIdempotencyKey = KEYS[2]
local userBalanceGoalKey = KEYS[3]

local amount = ARGV[1]
local idempotency = ARGV[2]
local goal = ARGV[3]

assert(type(amount) ~= "number", "amount expects a number")

-- Idempotency
local alreadyDecremented = redis.call("HGET", userBalanceDecrementIdempotencyKey, idempotency)

if alreadyDecremented ~= false then
  return redis.error_reply('409')
end

-- balance doesn't exists
if redis.call("EXISTS", userBalanceKey) == false then
  return redis.error_reply('409')
end

-- goal
local goalAmount = redis.call("HGET", userBalanceGoalKey, goal)

if goalAmount ~= amount then
  return redis.error_reply('409')
end

-- has money
local balance = redis.call("GET", userBalanceKey)

if (balance - amount) < 0 then
  return redis.error_reply('409')
end

redis.call("DECRBY", userBalanceKey, amount)
redis.call("HSET", userBalanceDecrementIdempotencyKey, idempotency, amount)
redis.call("HDEL", userBalanceGoalKey, goal)
