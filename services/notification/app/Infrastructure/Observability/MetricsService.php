<?php

declare(strict_types=1);

namespace App\Infrastructure\Observability;

use App\Domain\Notification\Status;
use App\Domain\Notification\TemplateRegistry;
use App\Infrastructure\Rabbit\RabbitConnection;
use App\Infrastructure\Rabbit\Topology;
use Illuminate\Support\Facades\Redis;
use Prometheus\CollectorRegistry;
use Prometheus\RenderTextFormat;
use Prometheus\Storage\Adapter;
use Prometheus\Storage\InMemory;
use Prometheus\Storage\Redis as PrometheusRedis;
use Throwable;

class MetricsService
{
    private CollectorRegistry $registry;

    private Adapter $adapter;

    public function __construct(?Adapter $adapter = null)
    {
        if ($adapter !== null) {
            $this->adapter = $adapter;
        } elseif (extension_loaded('redis') && ! app()->runningUnitTests()) {
            $redisHost = (string) config('database.redis.default.host', '127.0.0.1');
            $redisPort = (int) config('database.redis.default.port', 6379);
            $redisPassword = config('database.redis.default.password');

            PrometheusRedis::setDefaultOptions([
                'host' => $redisHost,
                'port' => $redisPort,
                'password' => $redisPassword,
                'timeout' => 1.0,
                'read_timeout' => 1.0,
                'persistent_connections' => false,
            ]);
            $this->adapter = new PrometheusRedis;
        } else {
            $this->adapter = new InMemory;
        }

        $this->registry = new CollectorRegistry($this->adapter, false);
        $this->registerMetrics();
    }

    public function getRegistry(): CollectorRegistry
    {
        return $this->registry;
    }

    private function registerMetrics(): void
    {
        // 1. notifications_created_total{template}
        $this->registry->getOrRegisterCounter(
            '',
            'notifications_created_total',
            'Total notifications created by template',
            ['template']
        );

        // 2. notifications_status_total{template,status}
        $this->registry->getOrRegisterGauge(
            '',
            'notifications_status_total',
            'Current count of notifications by status and template',
            ['template', 'status']
        );

        // 3. email_send_duration_seconds
        $this->registry->getOrRegisterHistogram(
            '',
            'email_send_duration_seconds',
            'Duration of email sending calls in seconds',
            [],
            [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
        );

        // 4. email_send_attempts_total{result}
        $this->registry->getOrRegisterCounter(
            '',
            'email_send_attempts_total',
            'Total email send attempts by result',
            ['result']
        );

        // 5. resend_rate_limited_total
        $this->registry->getOrRegisterCounter(
            '',
            'resend_rate_limited_total',
            'Total times Resend API returned 429 rate limit',
            []
        );

        // 6. webhook_events_total{type,result}
        $this->registry->getOrRegisterCounter(
            '',
            'webhook_events_total',
            'Total webhook events received by type and result',
            ['type', 'result']
        );

        // 7. kafka_messages_total{topic,result}
        $this->registry->getOrRegisterCounter(
            '',
            'kafka_messages_total',
            'Total Kafka messages consumed by topic and result',
            ['topic', 'result']
        );

        // 8. kafka_consumer_lag
        $this->registry->getOrRegisterGauge(
            '',
            'kafka_consumer_lag',
            'Estimated Kafka consumer lag',
            []
        );

        // 9. rabbit_queue_depth{queue}
        $this->registry->getOrRegisterGauge(
            '',
            'rabbit_queue_depth',
            'Current message count in RabbitMQ queues',
            ['queue']
        );

        // 10. dlq_messages_total{source}
        $this->registry->getOrRegisterCounter(
            '',
            'dlq_messages_total',
            'Total messages routed to dead-letter queue by source',
            ['source']
        );

        // 11. suppressed_total
        $this->registry->getOrRegisterGauge(
            '',
            'suppressed_total',
            'Total email addresses currently in suppression list',
            []
        );
    }

    public function notificationCreated(string $template): void
    {
        $this->registry->getCounter('', 'notifications_created_total')->inc([$template]);
    }

    public function emailSendAttempt(string $result): void
    {
        $this->registry->getCounter('', 'email_send_attempts_total')->inc([$result]);
    }

    public function observeEmailSendDuration(float $seconds): void
    {
        $this->registry->getHistogram('', 'email_send_duration_seconds')->observe($seconds, []);
    }

    public function resendRateLimited(): void
    {
        $this->registry->getCounter('', 'resend_rate_limited_total')->inc([]);
    }

    public function webhookEvent(string $type, string $result): void
    {
        $this->registry->getCounter('', 'webhook_events_total')->inc([$type, $result]);
    }

    public function kafkaMessage(string $topic, string $result): void
    {
        $this->registry->getCounter('', 'kafka_messages_total')->inc([$topic, $result]);
    }

    public function dlqMessage(string $source): void
    {
        $this->registry->getCounter('', 'dlq_messages_total')->inc([$source]);
    }

    public function setKafkaConsumerLag(int $lag): void
    {
        $this->registry->getGauge('', 'kafka_consumer_lag')->set($lag, []);
    }

    public function collectDynamicMetrics(): void
    {
        // 1. Collect suppressed_total
        try {
            $suppressedCount = (int) Redis::zcard('idx:suppressions');
            $this->registry->getGauge('', 'suppressed_total')->set($suppressedCount, []);
        } catch (Throwable) {
            $this->registry->getGauge('', 'suppressed_total')->set(0, []);
        }

        // 2. Collect rabbit_queue_depth{queue}
        $queues = Topology::getAllQueueNames();

        try {
            $connection = RabbitConnection::getShared();
            $channel = $connection->channel();
            foreach ($queues as $q) {
                try {
                    $decl = $channel->queue_declare($q, true);
                    $count = is_array($decl) && isset($decl[1]) ? (int) $decl[1] : 0;
                    $this->registry->getGauge('', 'rabbit_queue_depth')->set($count, [$q]);
                } catch (Throwable) {
                    $this->registry->getGauge('', 'rabbit_queue_depth')->set(0, [$q]);
                }
            }
        } catch (Throwable) {
            foreach ($queues as $q) {
                $this->registry->getGauge('', 'rabbit_queue_depth')->set(0, [$q]);
            }
        }

        // 3. Collect notifications_status_total{template,status}
        foreach (TemplateRegistry::all() as $template) {
            foreach (Status::cases() as $status) {
                try {
                    $count = (int) Redis::zcard("idx:status:{$status->value}");
                    // In a production system, an intersect could also be queried
                    $this->registry->getGauge('', 'notifications_status_total')->set($count, [$template, $status->value]);
                } catch (Throwable) {
                    $this->registry->getGauge('', 'notifications_status_total')->set(0, [$template, $status->value]);
                }
            }
        }
    }

    public function render(): string
    {
        $this->collectDynamicMetrics();

        $renderer = new RenderTextFormat;

        return $renderer->render($this->registry->getMetricFamilySamples());
    }
}
