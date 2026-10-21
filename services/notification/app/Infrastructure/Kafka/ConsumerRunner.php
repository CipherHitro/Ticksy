<?php

declare(strict_types=1);

namespace App\Infrastructure\Kafka;

use App\Application\EventRouter;
use App\Domain\Event\EventEnvelope;
use App\Http\Exceptions\ApiException;
use App\Http\Middleware\RequestIdMiddleware;
use Illuminate\Support\Facades\Log;
use RdKafka\Conf;
use RdKafka\KafkaConsumer;
use RdKafka\Message;
use Throwable;

class ConsumerRunner
{
    private bool $shouldStop = false;

    public function __construct(
        private readonly EventRouter $router,
        private readonly DlqProducer $dlqProducer
    ) {}

    public function stop(): void
    {
        $this->shouldStop = true;
    }

    /**
     * Process a single Kafka message payload (callable for both runner and unit tests).
     *
     * @return bool True if offset should be committed, false if it should be retried
     */
    public function processMessage(string $topic, int $partition, int $offset, string $rawPayload): bool
    {
        $data = json_decode($rawPayload, true);

        if (! is_array($data)) {
            // Malformed JSON -> poison message to DLQ, commit offset (K-04)
            $this->dlqProducer->produce($topic, $partition, $offset, $rawPayload, 'Malformed JSON payload');

            return true;
        }

        try {
            $envelope = EventEnvelope::fromArray($data);
        } catch (ApiException $e) {
            // Validation / UUID failure -> poison message to DLQ, commit offset (K-04)
            $this->dlqProducer->produce($topic, $partition, $offset, $rawPayload, $e->getMessage());

            return true;
        }

        RequestIdMiddleware::setRequestId($envelope->requestId);

        try {
            // Handle event (updates contact directory / writes Redis / publishes to RabbitMQ)
            $this->router->handle($envelope);

            // Successfully processed -> commit offset
            return true;
        } catch (ApiException $e) {
            // Business validation error (e.g. invalid currency) -> poison message to DLQ, commit offset (K-04)
            if ($e->getStatusCode() === 400) {
                $this->dlqProducer->produce($topic, $partition, $offset, $rawPayload, $e->getMessage());

                return true;
            }

            // Infrastructure error (Redis or RabbitMQ down) -> do NOT commit offset, retry (K-08)
            Log::error("Infrastructure error processing event {$envelope->eventId}: {$e->getMessage()}", [
                'eventId' => $envelope->eventId,
                'error' => $e->getMessage(),
            ]);

            return false;
        } catch (Throwable $e) {
            // Infrastructure error (e.g. connection lost) -> do NOT commit offset, retry (K-08)
            Log::error("Unexpected failure processing event {$envelope->eventId}: {$e->getMessage()}", [
                'eventId' => $envelope->eventId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function run(?int $maxMessages = null, ?int $maxSeconds = null): void
    {
        if (! class_exists(KafkaConsumer::class)) {
            Log::error('ext-rdkafka is not installed in the current PHP environment');

            return;
        }

        $conf = new Conf;
        $conf->set('metadata.broker.list', (string) config('notification.kafka.brokers', '127.0.0.1:9092'));
        $conf->set('group.id', (string) config('notification.kafka.group_id', 'notification-service'));
        $conf->set('enable.auto.commit', 'false');
        $conf->set('auto.offset.reset', 'earliest');

        $consumer = new KafkaConsumer($conf);
        $topics = (array) config('notification.kafka.topics');
        $consumer->subscribe($topics);

        Log::info('Kafka consumer subscribed to topics: '.implode(', ', $topics));

        $startTime = time();
        $processed = 0;

        while (! $this->shouldStop) {
            if ($maxSeconds !== null && (time() - $startTime) >= $maxSeconds) {
                break;
            }
            if ($maxMessages !== null && $processed >= $maxMessages) {
                break;
            }

            $message = $consumer->consume(1000); // 1000ms timeout

            switch ($message->err) {
                case RD_KAFKA_RESP_ERR_NO_ERROR:
                    $shouldCommit = $this->processMessage(
                        $message->topic_name,
                        $message->partition,
                        $message->offset,
                        $message->payload
                    );

                    if ($shouldCommit) {
                        $consumer->commit($message);
                    } else {
                        // Sleep briefly before retrying poll
                        usleep(500000);
                    }
                    $processed++;
                    break;

                case RD_KAFKA_RESP_ERR__TIMED_OUT:
                case RD_KAFKA_RESP_ERR__PARTITION_EOF:
                    break;

                default:
                    Log::error("Kafka consumer error: {$message->errstr()}", ['code' => $message->err]);
                    break;
            }
        }

        $consumer->close();
        Log::info('Kafka consumer closed cleanly');
    }
}
