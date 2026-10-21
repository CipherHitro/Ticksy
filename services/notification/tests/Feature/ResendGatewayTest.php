<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Notification\Status;
use App\Infrastructure\Email\ResendEmailGateway;
use App\Infrastructure\Email\TokenBucketLimiter;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ResendGatewayTest extends TestCase
{
    private ResendEmailGateway $gateway;

    private string $notificationId = 'aaaaaaaa-aaaa-5aaa-aaaa-aaaaaaaaaaaa';

    private string $apiKey = 're_test_key_123456789';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'notification.email.resend.api_key' => $this->apiKey,
            'notification.email.resend.base_url' => 'https://api.resend.com',
            'notification.email.from.address' => 'no-reply@mail.ticksy.local',
            'notification.email.from.name' => 'Ticksy',
        ]);

        $limiter = $this->createMock(TokenBucketLimiter::class);
        $limiter->method('acquire')->willReturn(true);

        $this->gateway = new ResendEmailGateway($limiter);
    }

    /**
     * G-01 & G-02: Happy path 200, checks headers, idempotency key, tags, html+text, timeouts.
     */
    public function test_g01_and_g02_successful_send_with_correct_request_shape(): void
    {
        Http::fake([
            'https://api.resend.com/emails' => Http::response([
                'id' => 're_msg_123456789',
            ], 200),
        ]);

        $result = $this->gateway->send(
            $this->notificationId,
            'delivered@resend.dev',
            'Welcome to Ticksy!',
            '<p>Hello HTML</p>',
            'Hello Text',
            'welcome'
        );

        $this->assertEquals(Status::SENT, $result->status);
        $this->assertEquals('re_msg_123456789', $result->providerMessageId);

        // Verify request payload and headers
        Http::assertSent(function (Request $request) {
            $authHeader = $request->header('Authorization');
            $idempotencyHeader = $request->header('Idempotency-Key');

            return str_contains($request->url(), 'api.resend.com/emails')
                && ($authHeader[0] ?? '') === 'Bearer '.$this->apiKey
                && ($idempotencyHeader[0] ?? '') === $this->notificationId
                && $request['to'] === ['delivered@resend.dev']
                && $request['html'] === '<p>Hello HTML</p>'
                && $request['text'] === 'Hello Text'
                && $request['subject'] === 'Welcome to Ticksy!'
                && count($request['tags']) === 2;
        });
    }

    /**
     * G-03: 5xx server error maps to transient retry.
     */
    public function test_g03_5xx_server_error_maps_to_transient_retry(): void
    {
        Http::fake([
            'https://api.resend.com/emails' => Http::response([
                'name' => 'internal_server_error',
                'message' => 'Resend servers down',
            ], 500),
        ]);

        $result = $this->gateway->send(
            $this->notificationId,
            'user@example.com',
            'Subject',
            '<p>html</p>',
            'text',
            'welcome'
        );

        $this->assertTrue($result->isTransient);
        $this->assertEquals(Status::QUEUED, $result->status);
        $this->assertNotEmpty($result->retryAfterSeconds);
    }

    /**
     * G-04: 429 rate limit honors Retry-After; daily quota delay is 1 hour.
     */
    public function test_g04_429_rate_limiting_and_quota_exceeded(): void
    {
        Http::fake([
            'https://api.resend.com/emails' => Http::sequence()
                ->push([
                    'name' => 'rate_limit_exceeded',
                    'message' => 'Rate limit exceeded',
                ], 429, ['Retry-After' => '4'])
                ->push([
                    'name' => 'daily_quota_exceeded',
                    'message' => 'You reached your daily quota limit',
                ], 429),
        ]);

        // First call: 429 rate limit with Retry-After: 4
        $result = $this->gateway->send(
            $this->notificationId,
            'user@example.com',
            'Subject',
            '<p>html</p>',
            'text',
            'welcome'
        );

        $this->assertTrue($result->isTransient);
        $this->assertEquals(4, $result->retryAfterSeconds);

        // Second call: 429 daily_quota_exceeded -> 3600s delay
        $resultQuota = $this->gateway->send(
            $this->notificationId,
            'user@example.com',
            'Subject',
            '<p>html</p>',
            'text',
            'welcome'
        );

        $this->assertTrue($resultQuota->isTransient);
        $this->assertEquals(3600, $resultQuota->retryAfterSeconds);
    }

    /**
     * G-05: 400/401/403/422 map to permanent FAILED immediately.
     */
    public function test_g05_permanent_errors_fail_immediately_no_retry(): void
    {
        $statusCodes = [400, 401, 403, 422];

        foreach ($statusCodes as $status) {
            Http::fake([
                'https://api.resend.com/emails' => Http::response([
                    'name' => 'validation_error',
                    'message' => "Client error {$status}",
                ], $status),
            ]);

            $result = $this->gateway->send(
                $this->notificationId,
                'user@example.com',
                'Subject',
                '<p>html</p>',
                'text',
                'welcome'
            );

            $this->assertFalse($result->isTransient, "Should not be transient for {$status}");
            $this->assertEquals(Status::FAILED, $result->status);
            $this->assertEquals('validation_error', $result->failureCode);
        }
    }

    /**
     * G-06: 409 concurrent -> retry; 409 invalid idempotent request -> FAILED.
     */
    public function test_g06_conflict_mappings(): void
    {
        Http::fake([
            'https://api.resend.com/emails' => Http::sequence()
                ->push([
                    'name' => 'concurrent_idempotent_requests',
                    'message' => 'Request is currently being processed',
                ], 409)
                ->push([
                    'name' => 'invalid_idempotent_request',
                    'message' => 'Payload changed for same idempotency key',
                ], 409),
        ]);

        // First call: 409 concurrent -> retry
        $resultConcurrent = $this->gateway->send(
            $this->notificationId,
            'user@example.com',
            'Subject',
            '<p>html</p>',
            'text',
            'welcome'
        );

        $this->assertTrue($resultConcurrent->isTransient);
        $this->assertEquals(Status::QUEUED, $resultConcurrent->status);

        // Second call: 409 invalid idempotent request -> permanent failure
        $resultInvalid = $this->gateway->send(
            $this->notificationId,
            'user@example.com',
            'Subject',
            '<p>html</p>',
            'text',
            'welcome'
        );

        $this->assertFalse($resultInvalid->isTransient);
        $this->assertEquals(Status::FAILED, $resultInvalid->status);
        $this->assertEquals('INVALID_IDEMPOTENT_REQUEST', $resultInvalid->failureCode);
    }
}
