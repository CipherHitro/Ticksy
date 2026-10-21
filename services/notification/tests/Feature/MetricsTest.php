<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Infrastructure\Observability\MetricsService;
use Tests\TestCase;

class MetricsTest extends TestCase
{
    public function test_metrics_endpoint_returns_prometheus_series(): void
    {
        /** @var MetricsService $metrics */
        $metrics = $this->app->make(MetricsService::class);
        $metrics->notificationCreated('welcome');
        $metrics->emailSendAttempt('success');
        $metrics->observeEmailSendDuration(0.12);
        $metrics->resendRateLimited();
        $metrics->webhookEvent('email.delivered', 'success');
        $metrics->kafkaMessage('booking.events', 'success');
        $metrics->dlqMessage('kafka');
        $metrics->setKafkaConsumerLag(0);

        $response = $this->get('/metrics');

        $response->assertStatus(200);
        $this->assertStringContainsString('text/plain', (string) $response->headers->get('Content-Type'));

        $body = $response->getContent();

        $this->assertStringContainsString('notifications_created_total', $body);
        $this->assertStringContainsString('notifications_status_total', $body);
        $this->assertStringContainsString('email_send_duration_seconds', $body);
        $this->assertStringContainsString('email_send_attempts_total', $body);
        $this->assertStringContainsString('resend_rate_limited_total', $body);
        $this->assertStringContainsString('webhook_events_total', $body);
        $this->assertStringContainsString('kafka_messages_total', $body);
        $this->assertStringContainsString('kafka_consumer_lag', $body);
        $this->assertStringContainsString('rabbit_queue_depth', $body);
        $this->assertStringContainsString('dlq_messages_total', $body);
        $this->assertStringContainsString('suppressed_total', $body);
    }
}
