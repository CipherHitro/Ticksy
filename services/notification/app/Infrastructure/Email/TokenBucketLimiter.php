<?php

declare(strict_types=1);

namespace App\Infrastructure\Email;

use Illuminate\Support\Facades\Redis;

class TokenBucketLimiter
{
    private const KEY = 'rate:resend';

    /**
     * Atomically consumes one token from the token bucket.
     * Returns true if a token was acquired, false if rate limit exceeded.
     */
    public function acquire(int $maxRps = 2): bool
    {
        $now = microtime(true);

        $lua = <<<'LUA'
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[1]) -- tokens per second
local now = tonumber(ARGV[2])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if not tokens then
    tokens = max_tokens
    last_refill = now
else
    local delta = math.max(0, now - last_refill)
    tokens = math.min(max_tokens, tokens + delta * refill_rate)
    last_refill = now
end

if tokens >= 1 then
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('EXPIRE', key, 10)
    return 1
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('EXPIRE', key, 10)
    return 0
end
LUA;

        try {
            $result = Redis::eval($lua, 1, self::KEY, (string) $maxRps, (string) $now);

            return $result === 1;
        } catch (\Throwable) {
            // If Redis is temporarily unreachable or error in eval, allow
            return true;
        }
    }
}
