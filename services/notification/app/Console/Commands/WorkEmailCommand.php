<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Application\EmailWorker;
use App\Infrastructure\Rabbit\RabbitConnection;
use App\Infrastructure\Rabbit\Topology;
use Illuminate\Console\Command;
use PhpAmqpLib\Message\AMQPMessage;

class WorkEmailCommand extends Command
{
    protected $signature = 'notifications:work-email 
                            {--max-time=3600 : Maximum seconds to run before gracefully restarting}
                            {--max-messages=1000 : Maximum messages to process before restarting}';

    protected $description = 'Run RabbitMQ worker consuming notifications.email queue';

    private bool $shouldStop = false;

    public function handle(EmailWorker $worker): int
    {
        $maxTime = (int) $this->option('max-time');
        $maxMessages = (int) $this->option('max-messages');
        $startTime = time();
        $processedCount = 0;

        // Register signal handlers if pcntl is loaded
        if (extension_loaded('pcntl')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, function () {
                $this->info('SIGTERM received, initiating graceful shutdown...');
                $this->shouldStop = true;
            });
            pcntl_signal(SIGINT, function () {
                $this->info('SIGINT received, initiating graceful shutdown...');
                $this->shouldStop = true;
            });
        }

        $connection = RabbitConnection::getShared();
        $channel = $connection->channel();

        // Ensure topology exists
        Topology::setup($channel);

        $prefetch = (int) config('notification.rabbitmq.prefetch', 2);
        $channel->basic_qos(0, $prefetch, false);

        $this->info('Listening for delivery jobs on queue: '.Topology::MAIN_QUEUE);

        $channel->basic_consume(
            Topology::MAIN_QUEUE,
            '',     // consumer tag (auto-generated)
            false,  // no_local
            false,  // no_ack (manual ack)
            false,  // exclusive
            false,  // nowait
            function (AMQPMessage $message) use ($worker, &$processedCount) {
                $worker->handleMessage($message);
                $processedCount++;
            }
        );

        while ($channel->is_consuming() && ! $this->shouldStop) {
            $channel->wait(null, false, 1.0);

            if ($maxTime > 0 && (time() - $startTime) >= $maxTime) {
                $this->info("Max execution time of {$maxTime}s reached. Exiting for restart.");
                break;
            }

            if ($maxMessages > 0 && $processedCount >= $maxMessages) {
                $this->info("Max message count of {$maxMessages} reached. Exiting for restart.");
                break;
            }
        }

        $channel->close();
        RabbitConnection::close();

        return 0;
    }
}
