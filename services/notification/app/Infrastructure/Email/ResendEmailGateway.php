<?php

declare(strict_types=1);

namespace App\Infrastructure\Email;

use App\Infrastructure\Logging\JsonLogFormatter;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class ResendEmailGateway implements EmailGateway
{
    public function __construct(
        private readonly TokenBucketLimiter $limiter
    ) {}

    public function send(
        string $notificationId,
        string $to,
        string $subject,
        string $html,
        string $text,
        string $template
    ): SendResult {
        $apiKey = (string) config('notification.email.resend.api_key');
        $baseUrl = (string) config('notification.email.resend.base_url', 'https://api.resend.com');
        $fromAddress = (string) config('notification.email.from.address', 'no-reply@mail.ticksy.local');
        $fromName = (string) config('notification.email.from.name', 'Ticksy');
        $maxRps = (int) config('notification.email.resend.max_rps', 2);

        // Check token bucket rate limiter
        if (! $this->limiter->acquire($maxRps)) {
            Log::warning('Outbound Resend rate limit bucket reached, pausing send', [
                'notificationId' => $notificationId,
            ]);

            return SendResult::transientRetry(1, 'Local token bucket rate limited');
        }

        $from = "{$fromName} <{$fromAddress}>";

        // Clean tag values: letters, digits, _, -
        $safeTemplate = (string) preg_replace('/[^a-zA-Z0-9_-]/', '', $template);
        $safeId = (string) preg_replace('/[^a-zA-Z0-9_-]/', '', $notificationId);

        $payload = [
            'from' => $from,
            'to' => [$to],
            'subject' => $subject,
            'html' => $html,
            'text' => $text,
            'headers' => [
                'X-Entity-Ref-ID' => $notificationId,
            ],
            'tags' => [
                ['name' => 'template', 'value' => $safeTemplate],
                ['name' => 'notification_id', 'value' => $safeId],
            ],
        ];

        try {
            $response = Http::withHeaders([
                'Authorization' => 'Bearer '.$apiKey,
                'Idempotency-Key' => $notificationId,
            ])
                ->connectTimeout(3)
                ->timeout(10)
                ->post("{$baseUrl}/emails", $payload);

            $status = $response->status();
            $body = $response->json() ?? [];

            // 200 or 201 Success
            if ($response->successful()) {
                $emailId = (string) ($body['id'] ?? '');
                Log::info("Email sent via Resend [{$template}] to ".JsonLogFormatter::maskEmail($to), [
                    'notificationId' => $notificationId,
                    'providerMessageId' => $emailId,
                    'template' => $template,
                ]);

                return SendResult::success($emailId);
            }

            $errorCode = (string) ($body['name'] ?? $body['code'] ?? 'ERROR');
            $errorMessage = (string) ($body['message'] ?? 'Resend API error');

            // 429 Rate limiting or Quota exceeded
            if ($status === 429) {
                if (str_contains($errorCode, 'quota') || str_contains($errorMessage, 'quota')) {
                    Log::error("Resend quota exceeded: {$errorMessage}", ['notificationId' => $notificationId]);

                    return SendResult::transientRetry(3600, 'Daily/Monthly quota exceeded');
                }

                $retryAfterHeader = $response->header('Retry-After');
                $retryAfter = $retryAfterHeader !== null && is_numeric($retryAfterHeader)
                    ? max(1, (int) $retryAfterHeader)
                    : 1;

                Log::warning("Resend API rate limit exceeded, retry in {$retryAfter}s", ['notificationId' => $notificationId]);

                return SendResult::transientRetry($retryAfter, 'Rate limit exceeded');
            }

            // 409 Conflict
            if ($status === 409) {
                if ($errorCode === 'invalid_idempotent_request' || str_contains($errorMessage, 'invalid_idempotent')) {
                    Log::error("Permanent 409 invalid idempotent request: {$errorMessage}", ['notificationId' => $notificationId]);

                    return SendResult::permanentFailure('INVALID_IDEMPOTENT_REQUEST', $errorMessage);
                }

                // concurrent_idempotent_requests -> retry
                Log::warning('Concurrent idempotent request to Resend, retrying', ['notificationId' => $notificationId]);

                return SendResult::transientRetry(5, 'Concurrent idempotent request');
            }

            // 5xx Server Error -> Transient retry
            if ($status >= 500) {
                Log::warning("Resend 5xx server error (HTTP {$status}): {$errorMessage}", ['notificationId' => $notificationId]);

                return SendResult::transientRetry(30, "Resend server error HTTP {$status}");
            }

            // 400, 401, 403, 422 Client errors -> Permanent failure
            Log::error("Permanent Resend failure (HTTP {$status}, {$errorCode}): {$errorMessage}", [
                'notificationId' => $notificationId,
                'status' => $status,
                'code' => $errorCode,
            ]);

            return SendResult::permanentFailure($errorCode, $errorMessage);

        } catch (ConnectionException $e) {
            Log::warning("Connection exception sending via Resend: {$e->getMessage()}", ['notificationId' => $notificationId]);

            return SendResult::transientRetry(30, 'Connection timeout or network failure');
        } catch (Throwable $e) {
            Log::warning("Unexpected exception sending via Resend: {$e->getMessage()}", ['notificationId' => $notificationId]);

            return SendResult::transientRetry(30, $e->getMessage());
        }
    }
}
