<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\NotificationRepository;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class SweepStuckCommand extends Command
{
    protected $signature = 'notifications:sweep-stuck 
                            {--threshold=600 : Number of seconds in SENDING status before considered stuck (default 10 min)}
                            {--dry-run : Report stuck notifications without modifying or re-enqueueing}';

    protected $description = 'Recover notifications stuck in SENDING state and re-enqueue them for delivery';

    public function handle(NotificationRepository $repo, Publisher $publisher): int
    {
        $threshold = (int) $this->option('threshold');
        $isDryRun = (bool) $this->option('dry-run');

        $this->info("Scanning for notifications stuck in SENDING status for > {$threshold} seconds...");

        $stuckIds = $repo->getStuckSendingIds($threshold);
        $totalStuck = count($stuckIds);

        if ($totalStuck === 0) {
            $this->info('No stuck notifications found.');

            return 0;
        }

        $this->warn("Found {$totalStuck} stuck notification(s).");

        $recovered = 0;
        foreach ($stuckIds as $id) {
            if ($isDryRun) {
                $this->line("[DRY-RUN] Would re-enqueue stuck notification: {$id}");

                continue;
            }

            $resetRecord = $repo->resetStuckSending($id);
            if ($resetRecord !== null) {
                $publisher->publish($id, 1);
                $recovered++;
                $this->line("Re-enqueued stuck notification: {$id}");
            }
        }

        Log::info('Stuck notifications sweeper finished', [
            'totalStuck' => $totalStuck,
            'recovered' => $recovered,
            'dryRun' => $isDryRun,
            'threshold' => $threshold,
        ]);

        $this->info("Sweeper completed. Recovered: {$recovered}/{$totalStuck}");

        return 0;
    }
}
