<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Application\EmailWorker;
use App\Domain\Notification\Category;
use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\Status;
use App\Infrastructure\Email\EmailGateway;
use App\Infrastructure\Email\SendResult;
use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\ContactDirectory;
use App\Infrastructure\Redis\NotificationRepository;
use App\Infrastructure\Redis\PreferenceStore;
use App\Infrastructure\Redis\SuppressionList;
use PhpAmqpLib\Message\AMQPMessage;
use Tests\TestCase;

class EmailWorkerTest extends TestCase
{
    private NotificationRepository $repo;

    private ContactDirectory $contactDir;

    private PreferenceStore $prefStore;

    private SuppressionList $suppressionList;

    private EmailGateway $emailGateway;

    private Publisher $publisher;

    private EmailWorker $worker;

    protected function setUp(): void
    {
        parent::setUp();

        $this->repo = $this->createMock(NotificationRepository::class);
        $this->contactDir = $this->createMock(ContactDirectory::class);
        $this->prefStore = $this->createMock(PreferenceStore::class);
        $this->suppressionList = $this->createMock(SuppressionList::class);
        $this->emailGateway = $this->createMock(EmailGateway::class);
        $this->publisher = $this->createMock(Publisher::class);

        $this->worker = new EmailWorker(
            $this->repo,
            $this->contactDir,
            $this->prefStore,
            $this->suppressionList,
            $this->emailGateway,
            $this->publisher
        );
    }

    /**
     * W-02: Happy path QUEUED -> SENT.
     */
    public function test_w02_happy_path_email_delivery(): void
    {
        $id = '11111111-1111-5111-a111-111111111111';
        $userId = 'usr-123';

        $record = new NotificationRecord(
            id: $id,
            userId: $userId,
            template: 'welcome',
            category: Category::TRANSACTIONAL,
            status: Status::QUEUED,
            data: [
                'userId' => $userId,
                'email' => 'alice@ticksy.local',
                'name' => 'Alice',
                'role' => 'ATTENDEE',
                'registeredAt' => '2026-11-01T10:00:00Z',
            ]
        );

        $this->repo->method('find')->with($id)->willReturn($record);
        $this->repo->expects($this->once())->method('claim')->with($id)->willReturn(true);

        $this->contactDir->method('get')->with($userId)->willReturn([
            'userId' => $userId,
            'email' => 'alice@ticksy.local',
            'name' => 'Alice',
            'role' => 'ATTENDEE',
            'updatedAt' => '2026-11-01T10:00:00Z',
        ]);

        $this->suppressionList->method('isSuppressed')->willReturn(false);
        $this->prefStore->method('allows')->willReturn(true);

        $this->emailGateway->expects($this->once())
            ->method('send')
            ->willReturn(SendResult::success('re_123456'));

        $this->repo->expects($this->once())
            ->method('updateStatus')
            ->with($id, Status::SENT, $this->anything());

        $message = $this->createMock(AMQPMessage::class);
        $message->method('getBody')->willReturn(json_encode([
            'notificationId' => $id,
            'attempt' => 1,
            'requestId' => 'req-1',
        ]));
        $message->expects($this->once())->method('ack');

        $this->worker->handleMessage($message);
    }

    /**
     * W-03: Concurrent workers / duplicate delivery -> claim script fails, no second send.
     */
    public function test_w03_concurrent_or_duplicate_claim_fails_gracefully(): void
    {
        $id = '11111111-1111-5111-a111-111111111111';
        $record = new NotificationRecord(
            id: $id,
            userId: 'usr-123',
            template: 'welcome',
            status: Status::SENDING
        );

        $this->repo->method('find')->with($id)->willReturn($record);
        // Another worker won the claim
        $this->repo->expects($this->once())->method('claim')->with($id)->willReturn(false);

        // Email gateway must NEVER be called
        $this->emailGateway->expects($this->never())->method('send');

        $message = $this->createMock(AMQPMessage::class);
        $message->method('getBody')->willReturn(json_encode([
            'notificationId' => $id,
            'attempt' => 1,
            'requestId' => 'req-1',
        ]));
        $message->expects($this->once())->method('ack');

        $this->worker->handleMessage($message);
    }

    /**
     * W-06: Malformed message goes to DLQ, message acked.
     */
    public function test_w06_malformed_message_routes_to_dlq(): void
    {
        $this->publisher->expects($this->once())->method('publishDlq');

        $message = $this->createMock(AMQPMessage::class);
        $message->method('getBody')->willReturn('invalid-json');
        $message->expects($this->once())->method('ack');

        $this->worker->handleMessage($message);
    }

    /**
     * W-07: Suppressed address skips send.
     */
    public function test_w07_suppressed_recipient_marked_skipped(): void
    {
        $id = '11111111-1111-5111-a111-111111111111';
        $userId = 'usr-123';
        $record = new NotificationRecord(
            id: $id,
            userId: $userId,
            template: 'welcome',
            status: Status::QUEUED,
            data: [
                'userId' => $userId,
                'email' => 'bounced@ticksy.local',
                'name' => 'Bounced User',
                'role' => 'ATTENDEE',
                'registeredAt' => '2026-11-01T10:00:00Z',
            ]
        );

        $this->repo->method('find')->willReturn($record);
        $this->repo->method('claim')->willReturn(true);
        $this->contactDir->method('get')->willReturn([
            'userId' => $userId,
            'email' => 'bounced@ticksy.local',
            'name' => 'Bounced User',
            'role' => 'ATTENDEE',
            'updatedAt' => '2026-11-01T10:00:00Z',
        ]);

        $this->suppressionList->method('isSuppressed')->willReturn(true);

        $this->emailGateway->expects($this->never())->method('send');
        $this->repo->expects($this->once())
            ->method('updateStatus')
            ->with($id, Status::SKIPPED, $this->anything());

        $message = $this->createMock(AMQPMessage::class);
        $message->method('getBody')->willReturn(json_encode([
            'notificationId' => $id,
            'attempt' => 1,
        ]));
        $message->expects($this->once())->method('ack');

        $this->worker->handleMessage($message);
    }

    /**
     * W-07: Opted out user category skips send.
     */
    public function test_w07_opted_out_category_marked_skipped(): void
    {
        $id = '11111111-1111-5111-a111-111111111111';
        $userId = 'usr-123';
        $record = new NotificationRecord(
            id: $id,
            userId: $userId,
            template: 'welcome',
            category: Category::REMINDERS, // opt-outable
            status: Status::QUEUED,
            data: [
                'userId' => $userId,
                'email' => 'alice@ticksy.local',
                'name' => 'Alice',
                'role' => 'ATTENDEE',
                'registeredAt' => '2026-11-01T10:00:00Z',
            ]
        );

        $this->repo->method('find')->willReturn($record);
        $this->repo->method('claim')->willReturn(true);
        $this->contactDir->method('get')->willReturn([
            'userId' => $userId,
            'email' => 'alice@ticksy.local',
            'name' => 'Alice',
            'role' => 'ATTENDEE',
            'updatedAt' => '2026-11-01T10:00:00Z',
        ]);

        $this->suppressionList->method('isSuppressed')->willReturn(false);
        $this->prefStore->method('allows')->with($userId, Category::REMINDERS)->willReturn(false);

        $this->emailGateway->expects($this->never())->method('send');
        $this->repo->expects($this->once())
            ->method('updateStatus')
            ->with($id, Status::SKIPPED, $this->anything());

        $message = $this->createMock(AMQPMessage::class);
        $message->method('getBody')->willReturn(json_encode([
            'notificationId' => $id,
            'attempt' => 1,
        ]));
        $message->expects($this->once())->method('ack');

        $this->worker->handleMessage($message);
    }
}
