<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Application\EventRouter;
use App\Application\FreshnessGuard;
use App\Domain\Event\EventEnvelope;
use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\Status;
use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\ContactDirectory;
use App\Infrastructure\Redis\NotificationRepository;
use Tests\TestCase;

class EventRouterTest extends TestCase
{
    private NotificationRepository $repo;

    private ContactDirectory $contactDir;

    private Publisher $publisher;

    private EventRouter $router;

    protected function setUp(): void
    {
        parent::setUp();

        $this->repo = $this->createMock(NotificationRepository::class);
        $this->contactDir = $this->createMock(ContactDirectory::class);
        $this->publisher = $this->createMock(Publisher::class);

        $this->router = new EventRouter($this->repo, $this->contactDir, $this->publisher);
    }

    /**
     * U-09: Freshness guard check.
     */
    public function test_u09_freshness_guard(): void
    {
        // 1 hour ago is fresh
        $fresh = now()->subHour()->toIso8601ZuluString();
        $this->assertFalse(FreshnessGuard::isStale($fresh, 72));

        // 80 hours ago is stale (older than 72h)
        $stale = now()->subHours(80)->toIso8601ZuluString();
        $this->assertTrue(FreshnessGuard::isStale($stale, 72));
    }

    /**
     * K-01: Inbound event types produce the right notification and publish a delivery job.
     */
    public function test_k01_booking_confirmed_produces_notification_and_job(): void
    {
        $envelope = EventEnvelope::fromArray([
            'eventId' => '11111111-1111-4111-a111-111111111111',
            'eventType' => 'BookingConfirmed',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'bkg-123',
            'aggregateVersion' => 1,
            'requestId' => 'req-abc',
            'payload' => [
                'bookingId' => 'bkg-123',
                'userId' => 'usr-456',
                'eventId' => 'evt-789',
                'eventTitle' => 'Live Concert',
                'totalAmountMinor' => 200000,
                'currency' => 'INR',
                'confirmedAt' => now()->toIso8601ZuluString(),
            ],
        ]);

        $this->repo->expects($this->once())
            ->method('create')
            ->with($this->callback(function (NotificationRecord $rec) {
                return $rec->template === 'booking-confirmation'
                    && $rec->status === Status::QUEUED
                    && $rec->userId === 'usr-456';
            }))
            ->willReturn(true);

        $this->publisher->expects($this->once())
            ->method('publish');

        $record = $this->router->handle($envelope);
        $this->assertNotNull($record);
        $this->assertEquals(Status::QUEUED, $record->status);
    }

    /**
     * K-02: Same event delivered 5x -> one notification, one email job.
     */
    public function test_k02_event_replay_deduplication(): void
    {
        $envelope = EventEnvelope::fromArray([
            'eventId' => '22222222-2222-4222-a222-222222222222',
            'eventType' => 'BookingRefunded',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'bkg-123',
            'aggregateVersion' => 2,
            'requestId' => 'req-def',
            'payload' => [
                'bookingId' => 'bkg-123',
                'userId' => 'usr-456',
                'eventTitle' => 'Live Concert',
                'refundAmountMinor' => 200000,
                'currency' => 'INR',
                'refundedAt' => now()->toIso8601ZuluString(),
            ],
        ]);

        // First delivery -> create succeeds, publish called
        $this->repo->expects($this->exactly(5))
            ->method('create')
            ->willReturnOnConsecutiveCalls(true, false, false, false, false);

        // Publish must only be called ONCE on the first successful creation
        $this->publisher->expects($this->once())->method('publish');

        // Deliver 5 times
        for ($i = 0; $i < 5; $i++) {
            $this->router->handle($envelope);
        }
    }

    /**
     * K-05: Unknown eventType ignored and committed.
     */
    public function test_k05_unknown_event_type_ignored(): void
    {
        $envelope = EventEnvelope::fromArray([
            'eventId' => '33333333-3333-4333-a333-333333333333',
            'eventType' => 'SomeFutureNewEvent',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'agg-1',
            'aggregateVersion' => 1,
            'requestId' => 'req-1',
            'payload' => ['foo' => 'bar'],
        ]);

        $this->publisher->expects($this->never())->method('publish');
        $this->repo->expects($this->never())->method('create');

        $result = $this->router->handle($envelope);
        $this->assertNull($result);
    }

    /**
     * K-06: UserRegistered updates directory; UserProfileUpdated updates directory;
     * stale UserRegistered updates directory but sends no welcome.
     */
    public function test_k06_user_directory_updates_and_stale_handling(): void
    {
        // 1. Fresh UserRegistered -> directory updated AND welcome queued
        $freshEnvelope = EventEnvelope::fromArray([
            'eventId' => '44444444-4444-4444-a444-444444444444',
            'eventType' => 'UserRegistered',
            'occurredAt' => now()->subMinutes(10)->toIso8601ZuluString(),
            'aggregateId' => 'user-1',
            'aggregateVersion' => 1,
            'requestId' => 'req-1',
            'payload' => [
                'userId' => 'user-1',
                'email' => 'alice@example.com',
                'name' => 'Alice',
                'role' => 'ATTENDEE',
                'registeredAt' => now()->toIso8601ZuluString(),
            ],
        ]);

        $this->contactDir->expects($this->exactly(2))->method('upsert');
        $this->repo->method('create')->willReturn(true);
        $this->publisher->expects($this->once())->method('publish');

        $recFresh = $this->router->handle($freshEnvelope);
        $this->assertEquals(Status::QUEUED, $recFresh->status);

        // 2. Stale UserRegistered (e.g. 100 hours old) -> directory updated BUT status is SKIPPED, no publish
        $staleEnvelope = EventEnvelope::fromArray([
            'eventId' => '55555555-5555-4555-a555-555555555555',
            'eventType' => 'UserRegistered',
            'occurredAt' => now()->subHours(100)->toIso8601ZuluString(),
            'aggregateId' => 'user-2',
            'aggregateVersion' => 1,
            'requestId' => 'req-2',
            'payload' => [
                'userId' => 'user-2',
                'email' => 'bob@example.com',
                'name' => 'Bob',
                'role' => 'ATTENDEE',
                'registeredAt' => now()->subHours(100)->toIso8601ZuluString(),
            ],
        ]);

        $recStale = $this->router->handle($staleEnvelope);
        $this->assertEquals(Status::SKIPPED, $recStale->status);
        $this->assertEquals('STALE_EVENT', $recStale->failureCode);

        // 3. UserProfileUpdated -> directory updated, no notification
        $updateEnvelope = EventEnvelope::fromArray([
            'eventId' => '66666666-6666-4666-a666-666666666666',
            'eventType' => 'UserProfileUpdated',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'user-1',
            'aggregateVersion' => 2,
            'requestId' => 'req-3',
            'payload' => [
                'userId' => 'user-1',
                'name' => 'Alice Updated',
            ],
        ]);

        $this->contactDir->expects($this->once())->method('update')->with('user-1', null, 'Alice Updated');
        $resUpdate = $this->router->handle($updateEnvelope);
        $this->assertNull($resUpdate);
    }
}
