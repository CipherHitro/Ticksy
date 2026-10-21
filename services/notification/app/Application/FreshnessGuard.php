<?php

declare(strict_types=1);

namespace App\Application;

use Carbon\Carbon;
use Throwable;

class FreshnessGuard
{
    /**
     * Check if an event's occurredAt timestamp is older than maxAgeHours.
     */
    public static function isStale(string $occurredAt, ?int $maxAgeHours = null): bool
    {
        $maxAge = $maxAgeHours ?? (int) config('notification.kafka.max_event_age_hours', 72);

        try {
            $eventTime = Carbon::parse($occurredAt, 'UTC');
            $cutoff = Carbon::now('UTC')->subHours($maxAge);

            return $eventTime->lt($cutoff);
        } catch (Throwable) {
            // Unparseable timestamp treated as stale
            return true;
        }
    }
}
