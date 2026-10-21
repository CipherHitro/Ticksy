<?php

declare(strict_types=1);

namespace App\Infrastructure\Rabbit;

use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Wire\AMQPTable;

class Topology
{
    public const EXCHANGE = 'notifications';

    public const MAIN_QUEUE = 'notifications.email';

    public const MAIN_ROUTING_KEY = 'email';

    public const DLQ_QUEUE = 'notifications.email.dlq';

    public const DLQ_ROUTING_KEY = 'email.dlq';

    /**
     * @return list<string>
     */
    public static function getAllQueueNames(): array
    {
        $queues = [self::MAIN_QUEUE, self::DLQ_QUEUE];
        foreach (RetryLadder::LADDER as $step) {
            $queues[] = "notifications.{$step['routingKey']}";
        }

        return $queues;
    }

    public static function setup(AMQPChannel $channel): void
    {
        // 1. Declare direct, durable exchange
        $channel->exchange_declare(
            self::EXCHANGE,
            'direct',
            false, // passive
            true,  // durable
            false  // auto_delete
        );

        // 2. Declare main email delivery queue
        $channel->queue_declare(
            self::MAIN_QUEUE,
            false, // passive
            true,  // durable
            false, // exclusive
            false  // auto_delete
        );

        $channel->queue_bind(self::MAIN_QUEUE, self::EXCHANGE, self::MAIN_ROUTING_KEY);

        // 3. Declare retry queues with queue-level TTL and DLX pointing back to main queue
        foreach (RetryLadder::LADDER as $step) {
            $routingKey = $step['routingKey'];
            $ttlMs = $step['ttlMs'];
            $queueName = "notifications.{$routingKey}";

            $arguments = new AMQPTable([
                'x-dead-letter-exchange' => self::EXCHANGE,
                'x-dead-letter-routing-key' => self::MAIN_ROUTING_KEY,
                'x-message-ttl' => $ttlMs,
            ]);

            $channel->queue_declare(
                $queueName,
                false, // passive
                true,  // durable
                false, // exclusive
                false, // auto_delete
                false, // nowait
                $arguments
            );

            $channel->queue_bind($queueName, self::EXCHANGE, $routingKey);
        }

        // 4. Declare Dead-Letter Queue (DLQ)
        $channel->queue_declare(
            self::DLQ_QUEUE,
            false, // passive
            true,  // durable
            false, // exclusive
            false  // auto_delete
        );

        $channel->queue_bind(self::DLQ_QUEUE, self::EXCHANGE, self::DLQ_ROUTING_KEY);
    }
}
