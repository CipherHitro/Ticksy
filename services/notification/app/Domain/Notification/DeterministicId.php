<?php

declare(strict_types=1);

namespace App\Domain\Notification;

use Ramsey\Uuid\Uuid;

class DeterministicId
{
    // Fixed namespace UUID for Ticksy Notification service
    public const NAMESPACE = '6ba7b812-9dad-11d1-80b4-00c04fd430c8';

    public static function generate(string $sourceEventId, string $template): string
    {
        $name = $sourceEventId.':'.$template;

        return Uuid::uuid5(self::NAMESPACE, $name)->toString();
    }
}
