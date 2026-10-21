<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\Status;
use App\Infrastructure\Redis\NotificationRepository;
use App\Infrastructure\Redis\SuppressionList;
use App\Infrastructure\Webhooks\SvixSignatureValidator;
use Illuminate\Support\Facades\Redis;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class WebhookFeatureTest extends TestCase
{
    private string $secret = 'whsec_mfYgzozCUCuObAh7B3MpQEiX2pTgPjy2';

    private NotificationRepository $repo;

    private SuppressionList $suppressionList;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'notification.email.resend.webhook_secret' => $this->secret,
        ]);

        $this->repo = $this->createMock(NotificationRepository::class);
        $this->suppressionList = $this->createMock(SuppressionList::class);

        $this->app->instance(NotificationRepository::class, $this->repo);
        $this->app->instance(SuppressionList::class, $this->suppressionList);
    }

    private function postSignedWebhook(array $payload, ?string $customSig = null, ?int $customTime = null): TestResponse
    {
        $rawBody = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $svixId = 'msg_'.uniqid();
        $timestamp = $customTime ?? time();
        $signature = $customSig ?? SvixSignatureValidator::generateSignature($rawBody, $svixId, $timestamp, $this->secret);

        $server = [
            'HTTP_SVIX_ID' => $svixId,
            'HTTP_SVIX_TIMESTAMP' => (string) $timestamp,
            'HTTP_SVIX_SIGNATURE' => $signature,
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
        ];

        return $this->call('POST', '/api/v1/notifications/webhooks/resend', [], [], [], $server, $rawBody);
    }

    /**
     * H-01: Valid signed delivered -> DELIVERED.
     */
    public function test_h01_delivered_updates_status(): void
    {
        $notifId = '11111111-1111-5111-a111-111111111111';
        $emailId = 're_del_123';

        $record = new NotificationRecord(
            id: $notifId,
            userId: 'user-1',
            template: 'welcome',
            status: Status::SENT
        );

        $this->repo->method('findByProviderMessageId')->with($emailId)->willReturn($record);
        $this->repo->expects($this->once())
            ->method('updateStatus')
            ->with($notifId, Status::DELIVERED, [], true);

        $response = $this->postSignedWebhook([
            'type' => 'email.delivered',
            'data' => [
                'email_id' => $emailId,
                'to' => ['alice@ticksy.local'],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);
    }

    /**
     * H-02: bounced -> BOUNCED + suppression.
     */
    public function test_h02_bounced_updates_status_and_suppresses_address(): void
    {
        $notifId = '22222222-2222-5222-a222-222222222222';
        $emailId = 're_bnc_456';
        $bouncedEmail = 'bounced@ticksy.local';

        $record = new NotificationRecord(
            id: $notifId,
            userId: 'user-2',
            template: 'welcome',
            status: Status::SENT
        );

        $this->repo->method('findByProviderMessageId')->with($emailId)->willReturn($record);

        $this->suppressionList->expects($this->once())
            ->method('suppress')
            ->with($bouncedEmail, 'bounced', $notifId);

        $this->repo->expects($this->once())
            ->method('updateStatus')
            ->with($notifId, Status::BOUNCED, $this->anything(), true);

        $response = $this->postSignedWebhook([
            'type' => 'email.bounced',
            'data' => [
                'email_id' => $emailId,
                'to' => [$bouncedEmail],
            ],
        ]);

        $response->assertStatus(200);
    }

    /**
     * H-03: complained -> COMPLAINED + suppression.
     */
    public function test_h03_complained_updates_status_and_suppresses(): void
    {
        $notifId = '33333333-3333-5333-a333-333333333333';
        $emailId = 're_cmp_789';
        $complainingEmail = 'complained@ticksy.local';

        $record = new NotificationRecord(
            id: $notifId,
            userId: 'user-3',
            template: 'welcome',
            status: Status::DELIVERED
        );

        $this->repo->method('findByProviderMessageId')->with($emailId)->willReturn($record);

        $this->suppressionList->expects($this->once())
            ->method('suppress')
            ->with($complainingEmail, 'complained', $notifId);

        $this->repo->expects($this->once())
            ->method('updateStatus')
            ->with($notifId, Status::COMPLAINED, $this->anything(), true);

        $response = $this->postSignedWebhook([
            'type' => 'email.complained',
            'data' => [
                'email_id' => $emailId,
                'to' => [$complainingEmail],
            ],
        ]);

        $response->assertStatus(200);
    }

    /**
     * H-04: Replay of same svix-id -> 200, no effect.
     */
    public function test_h04_replayed_svix_id_returns_200_no_effect(): void
    {
        Redis::shouldReceive('exists')->andReturn(true); // already seen
        $this->repo->expects($this->never())->method('updateStatus');

        $response = $this->postSignedWebhook([
            'type' => 'email.delivered',
            'data' => ['email_id' => 're_del_123'],
        ]);

        $response->assertStatus(200);
    }

    /**
     * H-05: Bad signature returns 401 in AGENTS envelope.
     */
    public function test_h05_bad_signature_returns_401(): void
    {
        $response = $this->postSignedWebhook(
            ['type' => 'email.delivered'],
            customSig: 'v1,invalid_signature_hex_1234'
        );

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'code' => 'UNAUTHENTICATED',
        ]);
    }

    /**
     * H-06: Unknown email_id -> 200 + log, no crash.
     */
    public function test_h06_unknown_email_id_returns_200(): void
    {
        $this->repo->method('findByProviderMessageId')->willReturn(null);
        $this->repo->expects($this->never())->method('updateStatus');

        $response = $this->postSignedWebhook([
            'type' => 'email.delivered',
            'data' => [
                'email_id' => 're_unknown_999999',
            ],
        ]);

        $response->assertStatus(200);
    }
}
