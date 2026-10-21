<?php

declare(strict_types=1);

namespace App\Infrastructure\Webhooks;

use App\Http\Exceptions\ApiException;

class SvixSignatureValidator
{
    private const TOLERANCE_SECONDS = 300; // 5 minutes

    /**
     * Validate Svix webhook signature and timestamp.
     *
     * @param  string  $rawBody  Raw HTTP request body
     * @param  string|null  $svixId  svix-id header
     * @param  string|null  $svixTimestamp  svix-timestamp header
     * @param  string|null  $svixSignature  svix-signature header
     * @param  string|null  $secret  Webhook secret (starts with whsec_)
     *
     * @throws ApiException If headers missing, timestamp expired, or signature mismatch
     */
    public static function validate(
        string $rawBody,
        ?string $svixId,
        ?string $svixTimestamp,
        ?string $svixSignature,
        ?string $secret = null
    ): void {
        if (empty($svixId) || empty($svixTimestamp) || empty($svixSignature)) {
            throw ApiException::unauthenticated('Missing required Svix webhook headers');
        }

        $webhookSecret = $secret ?? (string) config('notification.email.resend.webhook_secret');
        if (empty($webhookSecret)) {
            throw ApiException::unauthenticated('Webhook secret not configured');
        }

        // Verify timestamp within 5 minutes tolerance
        $timestamp = (int) $svixTimestamp;
        $now = time();
        if (abs($now - $timestamp) > self::TOLERANCE_SECONDS) {
            throw ApiException::unauthenticated('Webhook timestamp expired or too far in the future (skew > 300s)');
        }

        // Strip whsec_ prefix and base64 decode key
        $secretKey = $webhookSecret;
        if (str_starts_with($secretKey, 'whsec_')) {
            $secretKey = substr($secretKey, 6);
        }
        $key = base64_decode($secretKey, true);
        if ($key === false) {
            throw ApiException::unauthenticated('Invalid webhook secret key encoding');
        }

        // Calculate expected HMAC SHA256 signature
        $toSign = "{$svixId}.{$svixTimestamp}.{$rawBody}";
        $expectedSignature = base64_encode(hash_hmac('sha256', $toSign, $key, true));

        // svix-signature may contain multiple space-separated signatures (e.g. "v1,sig1 v1,sig2")
        $signatures = explode(' ', trim($svixSignature));
        $valid = false;

        foreach ($signatures as $sigItem) {
            $parts = explode(',', $sigItem, 2);
            if (count($parts) === 2 && $parts[0] === 'v1') {
                if (hash_equals($expectedSignature, $parts[1])) {
                    $valid = true;
                    break;
                }
            }
        }

        if (! $valid) {
            throw ApiException::unauthenticated('Invalid webhook signature');
        }
    }

    /**
     * Helper to generate valid Svix signature header for testing.
     */
    public static function generateSignature(
        string $rawBody,
        string $svixId,
        int $timestamp,
        string $secret
    ): string {
        $secretKey = $secret;
        if (str_starts_with($secretKey, 'whsec_')) {
            $secretKey = substr($secretKey, 6);
        }
        $key = base64_decode($secretKey, true) ?: '';
        $toSign = "{$svixId}.{$timestamp}.{$rawBody}";
        $signature = base64_encode(hash_hmac('sha256', $toSign, $key, true));

        return "v1,{$signature}";
    }
}
