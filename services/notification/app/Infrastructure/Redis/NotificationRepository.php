<?php

declare(strict_types=1);

namespace App\Infrastructure\Redis;

use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\StateMachine;
use App\Domain\Notification\Status;
use App\Domain\Notification\TemplateRegistry;
use App\Http\Exceptions\ApiException;
use Illuminate\Support\Facades\Redis;

class NotificationRepository
{
    private const PREFIX = 'notif:';

    private const TTL_SECONDS = 90 * 86400; // 90 days

    private const PROVIDER_PREFIX = 'provider:';

    public function find(string $id): ?NotificationRecord
    {
        $key = self::PREFIX.$id;
        $hash = Redis::hgetall($key);

        if (empty($hash) || empty($hash['id'])) {
            return null;
        }

        return NotificationRecord::fromRedisHash($hash);
    }

    public function findByProviderMessageId(string $providerMessageId): ?NotificationRecord
    {
        $id = Redis::get(self::PROVIDER_PREFIX.$providerMessageId);
        if (empty($id) || ! is_string($id)) {
            return null;
        }

        return $this->find($id);
    }

    public function create(NotificationRecord $record): bool
    {
        $key = self::PREFIX.$record->id;

        // Check if already exists (idempotency by deterministic ID)
        if (Redis::exists($key)) {
            return false;
        }

        $hash = $record->toRedisHash();
        Redis::hmset($key, $hash);
        Redis::expire($key, self::TTL_SECONDS);

        // Indices (score = timestamp in milliseconds)
        $score = (int) (microtime(true) * 1000);
        $id = $record->id;

        Redis::zadd("idx:user:{$record->userId}", $score, $id);
        Redis::zadd("idx:status:{$record->status->value}", $score, $id);
        Redis::zadd("idx:template:{$record->template}", $score, $id);
        Redis::zadd('idx:all', $score, $id);

        Redis::expire("idx:user:{$record->userId}", self::TTL_SECONDS);

        return true;
    }

    /**
     * Atomically claim a notification from QUEUED -> SENDING.
     * Returns true if claimed, false if already claimed or not found.
     */
    public function claim(string $id): bool
    {
        $key = self::PREFIX.$id;
        $now = now()->toIso8601ZuluString();

        $result = Redis::eval(
            LuaScripts::claimScript(),
            1,
            $key,
            Status::QUEUED->value,
            Status::SENDING->value,
            $now
        );

        if ($result === 1) {
            // Update indices
            $score = (int) (microtime(true) * 1000);
            Redis::zrem('idx:status:'.Status::QUEUED->value, $id);
            Redis::zadd('idx:status:'.Status::SENDING->value, $score, $id);

            return true;
        }

        return false;
    }

    /**
     * Update notification status enforcing StateMachine.
     *
     * @param  array<string, string>  $additionalFields
     */
    public function updateStatus(
        string $id,
        Status $targetStatus,
        array $additionalFields = [],
        bool $isWebhook = false
    ): NotificationRecord {
        $record = $this->find($id);
        if (! $record) {
            throw ApiException::notFound("Notification '{$id}' not found", 'NOTIFICATION_NOT_FOUND');
        }

        $currentStatus = $record->status;
        $resolvedStatus = StateMachine::transition($currentStatus, $targetStatus, $isWebhook);

        $key = self::PREFIX.$id;
        $now = now()->toIso8601ZuluString();

        $updates = $additionalFields;
        if ($resolvedStatus !== $currentStatus) {
            $updates['status'] = $resolvedStatus->value;

            if ($resolvedStatus === Status::SENT && ! isset($updates['sentAt'])) {
                $updates['sentAt'] = $now;
            } elseif ($resolvedStatus === Status::DELIVERED && ! isset($updates['deliveredAt'])) {
                $updates['deliveredAt'] = $now;
            } elseif ($resolvedStatus === Status::FAILED && ! isset($updates['failedAt'])) {
                $updates['failedAt'] = $now;
            }

            // Update status index
            $score = (int) (microtime(true) * 1000);
            Redis::zrem("idx:status:{$currentStatus->value}", $id);
            Redis::zadd("idx:status:{$resolvedStatus->value}", $score, $id);
        }

        if (! empty($updates)) {
            Redis::hmset($key, $updates);
        }

        if (! empty($updates['providerMessageId'])) {
            $this->indexProviderMessageId($updates['providerMessageId'], $id);
        }

        return $this->find($id) ?? $record;
    }

    /**
     * @return list<string>
     */
    public function getStuckSendingIds(int $olderThanSeconds = 600): array
    {
        $cutoffMs = (int) ((microtime(true) - $olderThanSeconds) * 1000);
        $ids = Redis::zrangebyscore('idx:status:'.Status::SENDING->value, '-inf', (string) $cutoffMs);

        return array_map('strval', $ids ?: []);
    }

    public function resetStuckSending(string $id): ?NotificationRecord
    {
        $record = $this->find($id);
        if (! $record || $record->status !== Status::SENDING) {
            return null;
        }

        return $this->updateStatus($id, Status::QUEUED);
    }

    public function indexProviderMessageId(string $providerMessageId, string $notificationId): void
    {
        Redis::setex(self::PROVIDER_PREFIX.$providerMessageId, self::TTL_SECONDS, $notificationId);
    }

    /**
     * @return array{data: list<NotificationRecord>, total: int}
     */
    public function listForUser(
        string $userId,
        ?Status $status = null,
        ?string $template = null,
        int $page = 1,
        int $limit = 20
    ): array {
        $userKey = "idx:user:{$userId}";

        if ($status !== null || $template !== null) {
            $tempKey = 'temp:user:'.uniqid().':'.time();
            $keysToIntersect = [$userKey];

            if ($status !== null) {
                $keysToIntersect[] = "idx:status:{$status->value}";
            }
            if ($template !== null) {
                $keysToIntersect[] = "idx:template:{$template}";
            }

            Redis::zinterstore($tempKey, $keysToIntersect);
            Redis::expire($tempKey, 30);
            $targetKey = $tempKey;
        } else {
            $targetKey = $userKey;
        }

        $total = (int) Redis::zcard($targetKey);
        $start = ($page - 1) * $limit;
        $end = $start + $limit - 1;

        $ids = Redis::zrevrange($targetKey, $start, $end);
        $records = [];

        foreach ($ids as $id) {
            $rec = $this->find((string) $id);
            if ($rec) {
                $records[] = $rec;
            }
        }

        if (isset($tempKey)) {
            Redis::del($tempKey);
        }

        return [
            'data' => $records,
            'total' => $total,
        ];
    }

    /**
     * @return array{data: list<NotificationRecord>, total: int}
     */
    public function listAll(
        ?Status $status = null,
        ?string $template = null,
        ?string $userId = null,
        ?string $from = null,
        ?string $to = null,
        int $page = 1,
        int $limit = 20
    ): array {
        $keysToIntersect = [];

        if ($userId !== null) {
            $keysToIntersect[] = "idx:user:{$userId}";
        } else {
            $keysToIntersect[] = 'idx:all';
        }

        if ($status !== null) {
            $keysToIntersect[] = "idx:status:{$status->value}";
        }

        if ($template !== null) {
            $keysToIntersect[] = "idx:template:{$template}";
        }

        if (count($keysToIntersect) > 1) {
            $tempKey = 'temp:admin:'.uniqid().':'.time();
            Redis::zinterstore($tempKey, $keysToIntersect, ['aggregate' => 'MAX']);
            Redis::expire($tempKey, 30);
            $targetKey = $tempKey;
        } else {
            $targetKey = $keysToIntersect[0];
        }

        $minScore = $from !== null ? (string) (int) (strtotime($from) * 1000) : '-inf';
        $maxScore = $to !== null ? (string) (int) (strtotime($to) * 1000) : '+inf';

        $start = ($page - 1) * $limit;
        $end = $start + $limit - 1;

        if ($from !== null || $to !== null) {
            $total = (int) Redis::zcount($targetKey, $minScore, $maxScore);
            $ids = Redis::zrevrangebyscore($targetKey, $maxScore, $minScore, ['limit' => [$start, $limit]]);
        } else {
            $total = (int) Redis::zcard($targetKey);
            $ids = Redis::zrevrange($targetKey, $start, $end);
        }

        $records = [];
        foreach ($ids as $id) {
            $rec = $this->find((string) $id);
            if ($rec) {
                $records[] = $rec;
            }
        }

        if (isset($tempKey)) {
            Redis::del($tempKey);
        }

        return [
            'data' => $records,
            'total' => $total,
        ];
    }

    /**
     * @return array{
     *     last24h: array{byStatus: array<string, int>, byTemplate: array<string, int>, total: int},
     *     last7d: array{byStatus: array<string, int>, byTemplate: array<string, int>, total: int}
     * }
     */
    public function getStats(): array
    {
        $nowMs = '+inf';
        $since24h = (string) (int) ((microtime(true) - 86400) * 1000);
        $since7d = (string) (int) ((microtime(true) - 7 * 86400) * 1000);

        $statuses = Status::cases();
        $templates = TemplateRegistry::all();

        $byStatus24h = [];
        $byStatus7d = [];
        foreach ($statuses as $s) {
            $byStatus24h[$s->value] = (int) Redis::zcount("idx:status:{$s->value}", $since24h, $nowMs);
            $byStatus7d[$s->value] = (int) Redis::zcount("idx:status:{$s->value}", $since7d, $nowMs);
        }

        $byTemplate24h = [];
        $byTemplate7d = [];
        foreach ($templates as $t) {
            $byTemplate24h[$t] = (int) Redis::zcount("idx:template:{$t}", $since24h, $nowMs);
            $byTemplate7d[$t] = (int) Redis::zcount("idx:template:{$t}", $since7d, $nowMs);
        }

        return [
            'last24h' => [
                'byStatus' => $byStatus24h,
                'byTemplate' => $byTemplate24h,
                'total' => (int) Redis::zcount('idx:all', $since24h, $nowMs),
            ],
            'last7d' => [
                'byStatus' => $byStatus7d,
                'byTemplate' => $byTemplate7d,
                'total' => (int) Redis::zcount('idx:all', $since7d, $nowMs),
            ],
        ];
    }
}
