<?php

declare(strict_types=1);

namespace App\Domain\Notification;

enum Category: string
{
    case TRANSACTIONAL = 'TRANSACTIONAL';
    case REMINDERS = 'REMINDERS';
    case PRODUCT_UPDATES = 'PRODUCT_UPDATES';

    public function isOptOutable(): bool
    {
        return $this !== self::TRANSACTIONAL;
    }
}
