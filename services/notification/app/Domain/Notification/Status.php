<?php

declare(strict_types=1);

namespace App\Domain\Notification;

enum Status: string
{
    case QUEUED = 'QUEUED';
    case SENDING = 'SENDING';
    case SENT = 'SENT';
    case DELIVERED = 'DELIVERED';
    case DELAYED = 'DELAYED';
    case BOUNCED = 'BOUNCED';
    case COMPLAINED = 'COMPLAINED';
    case SKIPPED = 'SKIPPED';
    case FAILED = 'FAILED';

    public function isTerminal(): bool
    {
        return in_array($this, [self::BOUNCED, self::COMPLAINED, self::SKIPPED], true);
    }

    /**
     * Rank of the status for evaluating forward progression from webhooks
     */
    public function rank(): int
    {
        return match ($this) {
            self::QUEUED => 1,
            self::SENDING => 2,
            self::SENT => 3,
            self::DELAYED => 4,
            self::DELIVERED => 5,
            self::BOUNCED, self::COMPLAINED, self::SKIPPED, self::FAILED => 6,
        };
    }
}
