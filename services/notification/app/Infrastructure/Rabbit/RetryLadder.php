<?php

declare(strict_types=1);

namespace App\Infrastructure\Rabbit;

class RetryLadder
{
    /**
     * Ladder configuration: attempt => [key, ttl_seconds, ttl_ms]
     * §7 & §15 U-10: 30s, 2m, 10m, 1h, 6h, then FAILED
     */
    public const LADDER = [
        1 => ['routingKey' => 'email.retry.30s', 'ttlSeconds' => 30, 'ttlMs' => 30000],
        2 => ['routingKey' => 'email.retry.2m', 'ttlSeconds' => 120, 'ttlMs' => 120000],
        3 => ['routingKey' => 'email.retry.10m', 'ttlSeconds' => 600, 'ttlMs' => 600000],
        4 => ['routingKey' => 'email.retry.1h', 'ttlSeconds' => 3600, 'ttlMs' => 3600000],
        5 => ['routingKey' => 'email.retry.6h', 'ttlSeconds' => 21600, 'ttlMs' => 21600000],
    ];

    public const MAX_ATTEMPTS = 5;

    /**
     * Get routing key for a given attempt.
     * Returns null if retries are exhausted (attempt > MAX_ATTEMPTS).
     */
    public static function getRoutingKeyForAttempt(int $attempt): ?string
    {
        return self::LADDER[$attempt]['routingKey'] ?? null;
    }

    /**
     * Get TTL in milliseconds for queue-level configuration.
     */
    public static function getTtlMsForAttempt(int $attempt): ?int
    {
        return self::LADDER[$attempt]['ttlMs'] ?? null;
    }

    /**
     * Check if attempt has exhausted all retry slots.
     */
    public static function isExhausted(int $attempt): bool
    {
        return $attempt > self::MAX_ATTEMPTS;
    }
}
