<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Notification\Category;
use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\Status;
use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\NotificationRepository;
use App\Infrastructure\Redis\PreferenceStore;
use App\Infrastructure\Redis\SuppressionList;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RestApiTest extends TestCase
{
    private string $privateKey;

    private string $publicKey;

    private array $jwks;

    private string $kid = 'test-rest-key-1';

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        $res = openssl_pkey_new([
            'digest_alg' => 'sha256',
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);

        $privKey = '';
        openssl_pkey_export($res, $privKey);
        $this->privateKey = $privKey;
        $details = openssl_pkey_get_details($res);
        $this->publicKey = $details['key'];

        $n = rtrim(strtr(base64_encode($details['rsa']['n']), '+/', '-_'), '=');
        $e = rtrim(strtr(base64_encode($details['rsa']['e']), '+/', '-_'), '=');

        $this->jwks = [
            'keys' => [
                [
                    'kty' => 'RSA',
                    'use' => 'sig',
                    'alg' => 'RS256',
                    'kid' => $this->kid,
                    'n' => $n,
                    'e' => $e,
                ],
            ],
        ];

        Http::fake([
            config('notification.jwt.jwks_url') => Http::response($this->jwks, 200),
        ]);
    }

    private function generateToken(string $userId, string $role = 'ATTENDEE'): string
    {
        $payload = [
            'sub' => $userId,
            'email' => 'user@example.com',
            'name' => 'Test User',
            'role' => $role,
            'iss' => 'ticksy-auth',
            'aud' => 'ticksy-api',
            'iat' => time(),
            'exp' => time() + 900,
        ];

        return JWT::encode($payload, $this->privateKey, 'RS256', $this->kid);
    }

    /**
     * A-03: GET /me shows only caller's notifications; pagination limits (limit>50, page=0) -> 400.
     */
    public function test_a03_me_notifications_and_pagination_validation(): void
    {
        $userId = '33333333-3333-5333-a333-333333333333';
        $token = $this->generateToken($userId, 'ATTENDEE');

        $mockRepo = $this->createMock(NotificationRepository::class);
        $dummyRecord = new NotificationRecord(
            id: '11111111-1111-5111-a111-111111111111',
            userId: $userId,
            template: 'welcome',
            channel: 'EMAIL',
            category: Category::TRANSACTIONAL,
            status: Status::SENT,
            subject: 'Welcome to Ticksy'
        );

        $mockRepo->expects($this->once())
            ->method('listForUser')
            ->with($userId, null, null, 1, 20)
            ->willReturn([
                'data' => [$dummyRecord],
                'total' => 1,
            ]);

        $this->app->instance(NotificationRepository::class, $mockRepo);

        // Success
        $res = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/notifications/me');

        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.0.id', '11111111-1111-5111-a111-111111111111')
            ->assertJsonPath('meta.page', 1)
            ->assertJsonPath('meta.limit', 20)
            ->assertJsonPath('meta.total', 1);

        // Page = 0 -> 400 VALIDATION_ERROR
        $resPageZero = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/notifications/me?page=0');
        $resPageZero->assertStatus(400)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        // Limit > 50 -> 400 VALIDATION_ERROR
        $resLimitHigh = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/notifications/me?limit=51');
        $resLimitHigh->assertStatus(400)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        // Invalid status -> 400 VALIDATION_ERROR
        $resBadStatus = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/notifications/me?status=INVALID_STATUS');
        $resBadStatus->assertStatus(400)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'VALIDATION_ERROR');
    }

    /**
     * A-04: Preferences: defaults, update, unknown field -> 400, disabling transactional -> 400.
     */
    public function test_a04_preferences_get_and_update(): void
    {
        $userId = '44444444-4444-5444-a444-444444444444';
        $token = $this->generateToken($userId, 'ATTENDEE');

        $mockStore = $this->createMock(PreferenceStore::class);
        $mockStore->method('get')
            ->with($userId)
            ->willReturn([
                'emailReminders' => true,
                'emailProductUpdates' => false,
            ]);

        $mockStore->expects($this->once())
            ->method('update')
            ->with($userId, ['emailProductUpdates' => true]);

        $this->app->instance(PreferenceStore::class, $mockStore);

        // GET defaults
        $getRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/notifications/me/preferences');
        $getRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.emailReminders', true)
            ->assertJsonPath('data.emailProductUpdates', false);

        // PUT valid update
        $putRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/notifications/me/preferences', [
                'emailProductUpdates' => true,
            ]);
        $putRes->assertStatus(200)
            ->assertJsonPath('success', true);

        // Disabling transactional (unknown field emailTransactional) -> 400
        $disRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/notifications/me/preferences', [
                'emailTransactional' => false,
            ]);
        $disRes->assertStatus(400)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        // Unknown random field -> 400
        $unkRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/notifications/me/preferences', [
                'customNotifications' => true,
            ]);
        $unkRes->assertStatus(400)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        // Non-boolean type -> 400
        $typeRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/notifications/me/preferences', [
                'emailReminders' => 'true',
            ]);
        $typeRes->assertStatus(400)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'VALIDATION_ERROR');
    }

    /**
     * A-05: Admin list filters and pagination. Retry works only for FAILED (else 409).
     */
    public function test_a05_admin_endpoints_and_retry_rules(): void
    {
        $adminId = '99999999-9999-5999-a999-999999999999';
        $adminToken = $this->generateToken($adminId, 'ADMIN');

        $mockRepo = $this->createMock(NotificationRepository::class);
        $mockPublisher = $this->createMock(Publisher::class);
        $mockSuppression = $this->createMock(SuppressionList::class);

        $failedRecord = new NotificationRecord(
            id: 'failed-notif-1',
            userId: 'user-1',
            template: 'welcome',
            channel: 'EMAIL',
            category: Category::TRANSACTIONAL,
            status: Status::FAILED,
            failureCode: 'RATE_LIMIT_EXCEEDED'
        );

        $sentRecord = new NotificationRecord(
            id: 'sent-notif-1',
            userId: 'user-1',
            template: 'welcome',
            channel: 'EMAIL',
            category: Category::TRANSACTIONAL,
            status: Status::SENT
        );

        $queuedRecord = new NotificationRecord(
            id: 'failed-notif-1',
            userId: 'user-1',
            template: 'welcome',
            channel: 'EMAIL',
            category: Category::TRANSACTIONAL,
            status: Status::QUEUED
        );

        $mockRepo->method('listAll')
            ->willReturn([
                'data' => [$failedRecord, $sentRecord],
                'total' => 2,
            ]);

        $mockRepo->method('find')
            ->willReturnMap([
                ['failed-notif-1', $failedRecord],
                ['sent-notif-1', $sentRecord],
                ['unknown-id', null],
            ]);

        $mockRepo->method('updateStatus')
            ->with('failed-notif-1', Status::QUEUED, ['failureCode' => '', 'failureMessage' => ''])
            ->willReturn($queuedRecord);

        $mockPublisher->expects($this->once())
            ->method('publish')
            ->with('failed-notif-1', 1);

        $mockRepo->method('getStats')
            ->willReturn([
                'last24h' => ['byStatus' => ['SENT' => 5], 'byTemplate' => ['welcome' => 5], 'total' => 5],
                'last7d' => ['byStatus' => ['SENT' => 20], 'byTemplate' => ['welcome' => 20], 'total' => 20],
            ]);

        $mockSuppression->method('list')
            ->willReturn([
                'data' => [['hash' => 'abc', 'reason' => 'bounced']],
                'total' => 1,
            ]);

        $mockSuppression->method('remove')
            ->willReturnMap([
                ['abc', true],
                ['nonexistent', false],
            ]);

        $this->app->instance(NotificationRepository::class, $mockRepo);
        $this->app->instance(Publisher::class, $mockPublisher);
        $this->app->instance(SuppressionList::class, $mockSuppression);

        // List notifications (admin)
        $listRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->getJson('/api/v1/notifications/admin/notifications');
        $listRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('meta.total', 2);

        // Show existing
        $showRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->getJson('/api/v1/notifications/admin/notifications/failed-notif-1');
        $showRes->assertStatus(200)
            ->assertJsonPath('data.id', 'failed-notif-1');

        // Show not found -> 404 NOT_FOUND / NOTIFICATION_NOT_FOUND
        $notFoundRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->getJson('/api/v1/notifications/admin/notifications/unknown-id');
        $notFoundRes->assertStatus(404)
            ->assertJsonPath('code', 'NOTIFICATION_NOT_FOUND');

        // Retry on SENT -> 409 CONFLICT / INVALID_STATE
        $retrySentRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->postJson('/api/v1/notifications/admin/notifications/sent-notif-1/retry');
        $retrySentRes->assertStatus(409)
            ->assertJsonPath('code', 'INVALID_STATE');

        // Retry on FAILED -> 200 and re-enqueued
        $retryFailedRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->postJson('/api/v1/notifications/admin/notifications/failed-notif-1/retry');
        $retryFailedRes->assertStatus(200)
            ->assertJsonPath('data.status', 'QUEUED');

        // Stats
        $statsRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->getJson('/api/v1/notifications/admin/stats');
        $statsRes->assertStatus(200)
            ->assertJsonPath('data.last24h.total', 5);

        // List suppressions
        $suppListRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->getJson('/api/v1/notifications/admin/suppressions');
        $suppListRes->assertStatus(200)
            ->assertJsonPath('meta.total', 1);

        // Delete suppression success -> 204
        $delRes = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->deleteJson('/api/v1/notifications/admin/suppressions/abc');
        $delRes->assertStatus(204);

        // Delete non-existent suppression -> 404
        $delNonExistent = $this->withHeader('Authorization', "Bearer {$adminToken}")
            ->deleteJson('/api/v1/notifications/admin/suppressions/nonexistent');
        $delNonExistent->assertStatus(404)
            ->assertJsonPath('code', 'SUPPRESSION_NOT_FOUND');
    }

    /**
     * A-06: Role authorization - ATTENDEE on admin route -> 403 FORBIDDEN.
     */
    public function test_a06_attendee_forbidden_on_admin(): void
    {
        $attendeeToken = $this->generateToken('user-1', 'ATTENDEE');

        $res = $this->withHeader('Authorization', "Bearer {$attendeeToken}")
            ->getJson('/api/v1/notifications/admin/notifications');

        $res->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'FORBIDDEN');
    }

    /**
     * A-07: Dev endpoints check environment.
     */
    public function test_a07_dev_endpoints_accessible_in_testing(): void
    {
        $res = $this->get('/api/v1/notifications/dev/preview/welcome');
        $res->assertStatus(200);
    }
}
