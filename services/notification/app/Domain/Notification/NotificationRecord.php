<?php

declare(strict_types=1);

namespace App\Domain\Notification;

class NotificationRecord
{
    /**
     * @param  array<string, mixed>  $data  Snapshot of event-derived fields
     */
    public function __construct(
        public string $id,
        public string $userId,
        public string $template,
        public string $channel = 'EMAIL',
        public Category $category = Category::TRANSACTIONAL,
        public Status $status = Status::QUEUED,
        public int $attempts = 0,
        public ?string $sourceEventId = null,
        public ?string $sourceEventType = null,
        public ?string $idempotencyKey = null,
        public ?string $providerMessageId = null,
        public ?string $subject = null,
        public array $data = [],
        public ?string $maskedRecipient = null,
        public ?string $createdAt = null,
        public ?string $sentAt = null,
        public ?string $deliveredAt = null,
        public ?string $failedAt = null,
        public ?string $failureCode = null,
        public ?string $failureMessage = null,
    ) {
        $this->createdAt ??= now()->toIso8601ZuluString();
        $this->idempotencyKey ??= $this->id;
    }

    /**
     * Convert to Redis hash string key-value pairs
     *
     * @return array<string, string>
     */
    public function toRedisHash(): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'template' => $this->template,
            'channel' => $this->channel,
            'category' => $this->category->value,
            'status' => $this->status->value,
            'attempts' => (string) $this->attempts,
            'sourceEventId' => (string) ($this->sourceEventId ?? ''),
            'sourceEventType' => (string) ($this->sourceEventType ?? ''),
            'idempotencyKey' => (string) ($this->idempotencyKey ?? ''),
            'providerMessageId' => (string) ($this->providerMessageId ?? ''),
            'subject' => (string) ($this->subject ?? ''),
            'data' => json_encode($this->data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}',
            'maskedRecipient' => (string) ($this->maskedRecipient ?? ''),
            'createdAt' => (string) ($this->createdAt ?? ''),
            'sentAt' => (string) ($this->sentAt ?? ''),
            'deliveredAt' => (string) ($this->deliveredAt ?? ''),
            'failedAt' => (string) ($this->failedAt ?? ''),
            'failureCode' => (string) ($this->failureCode ?? ''),
            'failureMessage' => (string) ($this->failureMessage ?? ''),
        ];
    }

    /**
     * Reconstruct from Redis hash
     *
     * @param  array<string, string>  $hash
     */
    public static function fromRedisHash(array $hash): self
    {
        $data = [];
        if (! empty($hash['data'])) {
            $decoded = json_decode($hash['data'], true);
            if (is_array($decoded)) {
                $data = $decoded;
            }
        }

        return new self(
            id: $hash['id'],
            userId: $hash['userId'],
            template: $hash['template'],
            channel: $hash['channel'] ?? 'EMAIL',
            category: Category::tryFrom($hash['category'] ?? '') ?? Category::TRANSACTIONAL,
            status: Status::tryFrom($hash['status'] ?? '') ?? Status::QUEUED,
            attempts: (int) ($hash['attempts'] ?? 0),
            sourceEventId: ! empty($hash['sourceEventId']) ? $hash['sourceEventId'] : null,
            sourceEventType: ! empty($hash['sourceEventType']) ? $hash['sourceEventType'] : null,
            idempotencyKey: ! empty($hash['idempotencyKey']) ? $hash['idempotencyKey'] : null,
            providerMessageId: ! empty($hash['providerMessageId']) ? $hash['providerMessageId'] : null,
            subject: ! empty($hash['subject']) ? $hash['subject'] : null,
            data: $data,
            maskedRecipient: ! empty($hash['maskedRecipient']) ? $hash['maskedRecipient'] : null,
            createdAt: ! empty($hash['createdAt']) ? $hash['createdAt'] : null,
            sentAt: ! empty($hash['sentAt']) ? $hash['sentAt'] : null,
            deliveredAt: ! empty($hash['deliveredAt']) ? $hash['deliveredAt'] : null,
            failedAt: ! empty($hash['failedAt']) ? $hash['failedAt'] : null,
            failureCode: ! empty($hash['failureCode']) ? $hash['failureCode'] : null,
            failureMessage: ! empty($hash['failureMessage']) ? $hash['failureMessage'] : null,
        );
    }

    /**
     * @return array<string, mixed> Clean representation for API responses
     */
    public function toApiArray(bool $includeData = false): array
    {
        $res = [
            'id' => $this->id,
            'userId' => $this->userId,
            'template' => $this->template,
            'channel' => $this->channel,
            'category' => $this->category->value,
            'status' => $this->status->value,
            'attempts' => $this->attempts,
            'subject' => $this->subject,
            'maskedRecipient' => $this->maskedRecipient,
            'createdAt' => $this->createdAt,
            'sentAt' => $this->sentAt,
            'deliveredAt' => $this->deliveredAt,
            'failedAt' => $this->failedAt,
            'failureCode' => $this->failureCode,
        ];

        if ($includeData) {
            $res['sourceEventId'] = $this->sourceEventId;
            $res['sourceEventType'] = $this->sourceEventType;
            $res['providerMessageId'] = $this->providerMessageId;
            $res['failureMessage'] = $this->failureMessage;
            $res['data'] = $this->data;
        }

        return $res;
    }
}
