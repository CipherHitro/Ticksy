<?php

declare(strict_types=1);

namespace App\Infrastructure\Redis;

class LuaScripts
{
    /**
     * Atomically claim a notification from QUEUED -> SENDING.
     * Returns:
     *   1  -> successfully claimed
     *   0  -> not in QUEUED state (e.g. already SENDING or terminal)
     *  -1  -> record does not exist
     */
    public static function claimScript(): string
    {
        return <<<'LUA'
local key = KEYS[1]
local expectedStatus = ARGV[1]
local newStatus = ARGV[2]
local timestamp = ARGV[3]

local currentStatus = redis.call('HGET', key, 'status')
if not currentStatus then
    return -1
end

if currentStatus ~= expectedStatus then
    return 0
end

redis.call('HSET', key, 'status', newStatus)
redis.call('HINCRBY', key, 'attempts', 1)
redis.call('HSET', key, 'claimedAt', timestamp)
return 1
LUA;
    }
}
