<?php

declare(strict_types=1);

namespace App\Domain\Notification;

enum SkippedReason: string
{
    case NO_CONTACT = 'NO_CONTACT';
    case OPTED_OUT = 'OPTED_OUT';
    case SUPPRESSED = 'SUPPRESSED';
    case STALE_EVENT = 'STALE_EVENT';
    case UNSUPPORTED_CURRENCY = 'UNSUPPORTED_CURRENCY';
}
