<?php

declare(strict_types=1);

namespace App\Infrastructure\Redis;

use App\Infrastructure\Logging\JsonLogFormatter;
use Illuminate\Support\Facades\Redis;

class SuppressionList
{
    private const PREFIX = 'suppress:';

    private const INDEX_KEY = 'idx:suppressions';

    public static function emailHash(string $email): string
    {
        return hash('sha256', strtolower(trim($email)));
    }

    public function isSuppressed(string $email): bool
    {
        $hash = self::emailHash($email);

        return (bool) Redis::exists(self::PREFIX.$hash);
    }

    public function suppress(string $email, string $reason, ?string $notificationId = null): void
    {
        $cleanEmail = strtolower(trim($email));
        $hash = hash('sha256', $cleanEmail);
        $key = self::PREFIX.$hash;
        $now = now()->toIso8601ZuluString();
        $score = (int) (microtime(true) * 1000);

        Redis::hmset($key, [
            'hash' => $hash,
            'maskedEmail' => JsonLogFormatter::maskEmail($cleanEmail),
            'reason' => $reason,
            'notificationId' => $notificationId ?? '',
            'at' => $now,
        ]);

        Redis::zadd(self::INDEX_KEY, $score, $hash);
    }

    public function remove(string $hash): bool
    {
        $key = self::PREFIX.$hash;
        $deleted = Redis::del($key);
        Redis::zrem(self::INDEX_KEY, $hash);

        return (int) $deleted > 0;
    }

    /**
     * @return array{data: list<array<string, mixed>>, total: int}
     */
    public function list(int $page = 1, int $limit = 20): array
    {
        $total = (int) Redis::zcard(self::INDEX_KEY);
        $start = ($page - 1) * $limit;
        $end = $start + $limit - 1;

        $hashes = Redis::zrevrange(self::INDEX_KEY, $start, $end);
        $items = [];

        foreach ($hashes as $hash) {
            $data = Redis::hgetall(self::PREFIX.$hash);
            if (! empty($data)) {
                $items[] = [
                    'hash' => $hash,
                    'maskedEmail' => $data['maskedEmail'] ?? '***',
                    'reason' => $data['reason'] ?? '',
                    'notificationId' => $data['notificationId'] ?? null,
                    'at' => $data['at'] ?? '',
                ];
            }
        }

        return [
            'data' => $items,
            'total' => $total,
        ];
    }
}
