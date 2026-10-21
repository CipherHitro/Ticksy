<?php

declare(strict_types=1);

namespace App\Domain\Support;

class SubjectSanitizer
{
    /**
     * Sanitize subject line to prevent email header injection.
     */
    public static function sanitize(string $subject): string
    {
        // Strip CR, LF, and null bytes
        $clean = str_replace(["\r", "\n", "\0"], ' ', $subject);

        // Replace multiple spaces with a single space and trim
        return trim((string) preg_replace('/\s+/', ' ', $clean));
    }
}
