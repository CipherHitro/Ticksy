<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Notification\Status;
use App\Domain\Notification\TemplateRegistry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

class CleanRetentionCommand extends Command
{
    protected $signature = 'notifications:clean-retention 
                            {--days=90 : Retention window in days (default 90)}
                            {--limit=1000 : Max records to clean per run}
                            {--dry-run : Only report without deleting}';

    protected $description = 'Clean up expired notification index entries older than retention window';

    public function handle(): int
    {
        $days = (int) $this->option('days');
        $limit = (int) $this->option('limit');
        $isDryRun = (bool) $this->option('dry-run');

        $cutoffMs = (int) ((microtime(true) - ($days * 86400)) * 1000);
        $this->info("Scanning for notification indices older than {$days} days (cutoff: {$cutoffMs})...");

        $oldIds = Redis::zrangebyscore('idx:all', '-inf', (string) $cutoffMs, ['limit' => [0, $limit]]);
        $total = count($oldIds);

        if ($total === 0) {
            $this->info('No expired indices found.');

            return 0;
        }

        $this->warn("Found {$total} expired candidate(s).");

        $cleaned = 0;
        foreach ($oldIds as $id) {
            $idStr = (string) $id;
            // If the main notification key has already expired
            if (! Redis::exists('notif:'.$idStr)) {
                if ($isDryRun) {
                    $this->line("[DRY-RUN] Would remove orphaned index entry: {$idStr}");

                    continue;
                }

                // Remove from idx:all
                Redis::zrem('idx:all', $idStr);

                // Remove from all status indices
                foreach (Status::cases() as $s) {
                    Redis::zrem("idx:status:{$s->value}", $idStr);
                }

                // Remove from template indices
                foreach (TemplateRegistry::all() as $t) {
                    Redis::zrem("idx:template:{$t}", $idStr);
                }

                $cleaned++;
            }
        }

        Log::info('Retention cleaner finished', [
            'candidates' => $total,
            'cleaned' => $cleaned,
            'dryRun' => $isDryRun,
            'days' => $days,
        ]);

        $this->info("Retention cleanup completed. Cleaned: {$cleaned}/{$total}");

        return 0;
    }
}
