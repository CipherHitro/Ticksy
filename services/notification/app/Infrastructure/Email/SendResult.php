<?php

declare(strict_types=1);

namespace App\Infrastructure\Email;

use App\Domain\Notification\Status;

readonly class SendResult
{
    public function __construct(
        public Status $status,
        public bool $isTransient = false,
        public ?int $retryAfterSeconds = null,
        public ?string $providerMessageId = null,
        public ?string $failureCode = null,
        public ?string $failureMessage = null,
    ) {}

    public static function success(string $providerMessageId): self
    {
        return new self(
            status: Status::SENT,
            providerMessageId: $providerMessageId
        );
    }

    public static function transientRetry(?int $retryAfterSeconds = null, ?string $message = null): self
    {
        return new self(
            status: Status::QUEUED,
            isTransient: true,
            retryAfterSeconds: $retryAfterSeconds,
            failureMessage: $message ?? 'Transient error occurred, retry scheduled'
        );
    }

    public static function permanentFailure(string $code, string $message): self
    {
        return new self(
            status: Status::FAILED,
            isTransient: false,
            failureCode: $code,
            failureMessage: $message
        );
    }
}
