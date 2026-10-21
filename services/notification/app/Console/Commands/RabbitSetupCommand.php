<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Infrastructure\Rabbit\RabbitConnection;
use App\Infrastructure\Rabbit\Topology;
use Illuminate\Console\Command;

class RabbitSetupCommand extends Command
{
    protected $signature = 'rabbitmq:setup';

    protected $description = 'Declare RabbitMQ exchanges, queues, retry queues with TTL, and DLQ idempotently';

    public function handle(): int
    {
        $this->info('Connecting to RabbitMQ...');
        $connection = RabbitConnection::getShared();
        $channel = $connection->channel();

        $this->info('Declaring RabbitMQ topology...');
        Topology::setup($channel);

        $channel->close();
        $this->info('RabbitMQ topology declared successfully.');

        return 0;
    }
}
