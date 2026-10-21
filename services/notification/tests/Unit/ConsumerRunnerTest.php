<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Application\EventRouter;
use App\Http\Exceptions\ApiException;
use App\Infrastructure\Kafka\ConsumerRunner;
use App\Infrastructure\Kafka\DlqProducer;
use RuntimeException;
use Tests\TestCase;

class ConsumerRunnerTest extends TestCase
{
    private EventRouter $router;

    private DlqProducer $dlqProducer;

    private ConsumerRunner $runner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->router = $this->createMock(EventRouter::class);
        $this->dlqProducer = $this->createMock(DlqProducer::class);
        $this->runner = new ConsumerRunner($this->router, $this->dlqProducer);
    }

    /**
     * K-04: Malformed JSON routes to DLQ and commits offset (returns true).
     */
    public function test_k04_malformed_json_routes_to_dlq_and_commits(): void
    {
        $this->dlqProducer->expects($this->once())
            ->method('produce')
            ->with(
                'booking.events',
                0,
                100,
                'invalid-json{',
                'Malformed JSON payload'
            );

        $shouldCommit = $this->runner->processMessage('booking.events', 0, 100, 'invalid-json{');
        $this->assertTrue($shouldCommit);
    }

    /**
     * K-04: Invalid UUID or envelope routes to DLQ and commits offset.
     */
    public function test_k04_invalid_uuid_routes_to_dlq_and_commits(): void
    {
        $invalidUuidPayload = json_encode([
            'eventId' => 'not-a-valid-uuid',
            'eventType' => 'BookingConfirmed',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'bkg-1',
            'aggregateVersion' => 1,
            'requestId' => 'req-1',
            'payload' => [],
        ]);

        $this->dlqProducer->expects($this->once())
            ->method('produce')
            ->with(
                'booking.events',
                0,
                101,
                $invalidUuidPayload,
                $this->stringContains('Invalid eventId UUID')
            );

        $shouldCommit = $this->runner->processMessage('booking.events', 0, 101, $invalidUuidPayload);
        $this->assertTrue($shouldCommit);
    }

    /**
     * K-04: Invalid currency routes to DLQ and commits offset.
     */
    public function test_k04_invalid_currency_routes_to_dlq_and_commits(): void
    {
        $payloadWithBadCurrency = json_encode([
            'eventId' => '11111111-1111-4111-a111-111111111111',
            'eventType' => 'BookingConfirmed',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'bkg-1',
            'aggregateVersion' => 1,
            'requestId' => 'req-1',
            'payload' => [
                'bookingId' => 'bkg-1',
                'userId' => 'usr-1',
                'eventId' => 'evt-1',
                'eventTitle' => 'Concert',
                'totalAmountMinor' => 1000,
                'currency' => 'TOOLONG',
                'confirmedAt' => now()->toIso8601ZuluString(),
            ],
        ]);

        $this->router->method('handle')
            ->willThrowException(ApiException::validation("Invalid 3-letter currency code: 'TOOLONG'"));

        $this->dlqProducer->expects($this->once())
            ->method('produce')
            ->with(
                'booking.events',
                0,
                102,
                $payloadWithBadCurrency,
                $this->stringContains('Invalid 3-letter currency code')
            );

        $shouldCommit = $this->runner->processMessage('booking.events', 0, 102, $payloadWithBadCurrency);
        $this->assertTrue($shouldCommit);
    }

    /**
     * K-08: RabbitMQ or Redis infrastructure failure does NOT commit offset (returns false).
     */
    public function test_k08_infrastructure_failure_does_not_commit_offset(): void
    {
        $validPayload = json_encode([
            'eventId' => '22222222-2222-4222-a222-222222222222',
            'eventType' => 'BookingConfirmed',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'bkg-1',
            'aggregateVersion' => 1,
            'requestId' => 'req-1',
            'payload' => [
                'bookingId' => 'bkg-1',
                'userId' => 'usr-1',
                'eventId' => 'evt-1',
                'eventTitle' => 'Concert',
                'totalAmountMinor' => 1000,
                'currency' => 'INR',
                'confirmedAt' => now()->toIso8601ZuluString(),
            ],
        ]);

        // Simulated broker connection failure
        $this->router->method('handle')
            ->willThrowException(new RuntimeException('Could not connect to RabbitMQ broker'));

        $this->dlqProducer->expects($this->never())->method('produce');

        $shouldCommit = $this->runner->processMessage('booking.events', 0, 103, $validPayload);
        $this->assertFalse($shouldCommit); // Must return false so offset is NOT committed
    }

    /**
     * Happy path message commits offset.
     */
    public function test_happy_path_commits_offset(): void
    {
        $validPayload = json_encode([
            'eventId' => '33333333-3333-4333-a333-333333333333',
            'eventType' => 'BookingConfirmed',
            'occurredAt' => now()->toIso8601ZuluString(),
            'aggregateId' => 'bkg-1',
            'aggregateVersion' => 1,
            'requestId' => 'req-1',
            'payload' => [
                'bookingId' => 'bkg-1',
                'userId' => 'usr-1',
                'eventId' => 'evt-1',
                'eventTitle' => 'Concert',
                'totalAmountMinor' => 1000,
                'currency' => 'INR',
                'confirmedAt' => now()->toIso8601ZuluString(),
            ],
        ]);

        $this->router->expects($this->once())->method('handle');
        $this->dlqProducer->expects($this->never())->method('produce');

        $shouldCommit = $this->runner->processMessage('booking.events', 0, 104, $validPayload);
        $this->assertTrue($shouldCommit);
    }
}
