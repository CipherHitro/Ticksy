<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Infrastructure\Kafka\ConsumerRunner;
use Illuminate\Console\Command;

class ConsumeKafkaCommand extends Command
{
    protected $signature = 'notifications:consume-kafka
                            {--max-time=3600 : Maximum seconds to run before gracefully restarting}
                            {--max-messages=10000 : Maximum messages to process before restarting}';

    protected $description = 'Consume domain events from Kafka topics';

    public function handle(ConsumerRunner $runner): int
    {
        $maxTime = (int) $this->option('max-time');
        $maxMessages = (int) $this->option('max-messages');

        if (extension_loaded('pcntl')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, function () use ($runner) {
                $this->info('SIGTERM received, stopping Kafka consumer...');
                $runner->stop();
            });
            pcntl_signal(SIGINT, function () use ($runner) {
                $this->info('SIGINT received, stopping Kafka consumer...');
                $runner->stop();
            });
        }

        $this->info('Starting Kafka consumer...');
        $runner->run($maxMessages, $maxTime);

        return 0;
    }
}
