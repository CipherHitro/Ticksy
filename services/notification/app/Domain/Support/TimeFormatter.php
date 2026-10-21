<?php

declare(strict_types=1);

namespace App\Domain\Support;

use Carbon\Carbon;
use Throwable;

class TimeFormatter
{
    /**
     * Convert an ISO-8601 UTC timestamp to display timezone string.
     */
    public static function format(string $utcTimestamp, ?string $timezone = null): string
    {
        $targetTimezone = $timezone ?? (string) config('notification.display_timezone', 'Asia/Kolkata');

        try {
            return Carbon::parse($utcTimestamp, 'UTC')
                ->setTimezone($targetTimezone)
                ->format('D, d M Y, h:i A');
        } catch (Throwable) {
            return $utcTimestamp;
        }
    }

    /**
     * Format into separate date and time for clean display.
     *
     * @return array{date: string, time: string}
     */
    public static function splitDateAndTime(string $utcTimestamp, ?string $timezone = null): array
    {
        $targetTimezone = $timezone ?? (string) config('notification.display_timezone', 'Asia/Kolkata');

        try {
            $carbon = Carbon::parse($utcTimestamp, 'UTC')->setTimezone($targetTimezone);

            return [
                'date' => $carbon->format('D, d M Y'),
                'time' => $carbon->format('h:i A T'),
            ];
        } catch (Throwable) {
            return [
                'date' => $utcTimestamp,
                'time' => '',
            ];
        }
    }
}
