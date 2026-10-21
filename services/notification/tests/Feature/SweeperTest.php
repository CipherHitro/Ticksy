<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Notification\Category;
use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\Status;
use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\NotificationRepository;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class SweeperTest extends TestCase
{
    public function test_sweep_stuck_recovers_stuck_sending_notifications(): void
    {
        $mockRepo = $this->createMock(NotificationRepository::class);
        $mockPublisher = $this->createMock(Publisher::class);

        $stuckId = 'stuck-notif-1';
        $recoveredRecord = new NotificationRecord(
            id: $stuckId,
            userId: 'user-1',
            template: 'welcome',
            channel: 'EMAIL',
            category: Category::TRANSACTIONAL,
            status: Status::QUEUED
        );

        $mockRepo->expects($this->once())
            ->method('getStuckSendingIds')
            ->with(600)
            ->willReturn([$stuckId]);

        $mockRepo->expects($this->once())
            ->method('resetStuckSending')
            ->with($stuckId)
            ->willReturn($recoveredRecord);

        $mockPublisher->expects($this->once())
            ->method('publish')
            ->with($stuckId, 1);

        $this->app->instance(NotificationRepository::class, $mockRepo);
        $this->app->instance(Publisher::class, $mockPublisher);

        $code = Artisan::call('notifications:sweep-stuck', ['--threshold' => '600']);
        $this->assertSame(0, $code);

        $output = Artisan::output();
        $this->assertStringContainsString('Re-enqueued stuck notification: stuck-notif-1', $output);
        $this->assertStringContainsString('Recovered: 1/1', $output);
    }

    public function test_sweep_stuck_dry_run_does_not_modify(): void
    {
        $mockRepo = $this->createMock(NotificationRepository::class);
        $mockPublisher = $this->createMock(Publisher::class);

        $mockRepo->expects($this->once())
            ->method('getStuckSendingIds')
            ->willReturn(['stuck-notif-2']);

        $mockRepo->expects($this->never())
            ->method('resetStuckSending');

        $mockPublisher->expects($this->never())
            ->method('publish');

        $this->app->instance(NotificationRepository::class, $mockRepo);
        $this->app->instance(Publisher::class, $mockPublisher);

        $code = Artisan::call('notifications:sweep-stuck', ['--dry-run' => true]);
        $this->assertSame(0, $code);

        $output = Artisan::output();
        $this->assertStringContainsString('[DRY-RUN] Would re-enqueue stuck notification: stuck-notif-2', $output);
    }
}
