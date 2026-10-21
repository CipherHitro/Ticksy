<?php

declare(strict_types=1);

namespace App\Infrastructure\Kafka;

use Illuminate\Support\Facades\Log;
use RdKafka\Conf;
use RdKafka\Producer;

class DlqProducer
{
    private ?Producer $producer = null;

    public function produce(
        string $sourceTopic,
        int $partition,
        int $offset,
        string $payload,
        string $errorMessage
    ): void {
        $dlqTopic = (string) config('notification.kafka.dlq_topic', 'notifications.dlq');

        Log::error("Routing poison message to Kafka DLQ topic '{$dlqTopic}': {$errorMessage}", [
            'sourceTopic' => $sourceTopic,
            'partition' => $partition,
            'offset' => $offset,
            'error' => $errorMessage,
        ]);

        if (! class_exists(Producer::class)) {
            // RdKafka not installed in current runtime, logged
            return;
        }

        try {
            if ($this->producer === null) {
                $conf = new Conf;
                $conf->set('metadata.broker.list', (string) config('notification.kafka.brokers', '127.0.0.1:9092'));
                $this->producer = new Producer($conf);
            }

            $topic = $this->producer->newTopic($dlqTopic);
            $headers = [
                'x-source-topic' => $sourceTopic,
                'x-source-partition' => (string) $partition,
                'x-source-offset' => (string) $offset,
                'x-error' => $errorMessage,
            ];

            $topic->producev(
                RD_KAFKA_PARTITION_UA,
                0,
                $payload,
                null,
                $headers
            );

            $this->producer->flush(2000);
        } catch (\Throwable $e) {
            Log::error("Failed to publish to Kafka DLQ: {$e->getMessage()}", [
                'error' => $e->getMessage(),
            ]);
        }
    }
}
