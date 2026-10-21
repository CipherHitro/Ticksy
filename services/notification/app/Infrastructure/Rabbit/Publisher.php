<?php

declare(strict_types=1);

namespace App\Infrastructure\Rabbit;

use App\Http\Middleware\RequestIdMiddleware;
use PhpAmqpLib\Message\AMQPMessage;
use PhpAmqpLib\Wire\AMQPTable;

class Publisher
{
    /**
     * Publish delivery job to the main email queue.
     */
    public function publish(string $notificationId, int $attempt = 1, ?string $requestId = null): void
    {
        $this->sendToRoutingKey(Topology::MAIN_ROUTING_KEY, $notificationId, $attempt, $requestId);
    }

    /**
     * Publish delivery job to a retry queue matching the attempt.
     */
    public function publishRetry(string $notificationId, int $attempt, ?string $requestId = null): void
    {
        $routingKey = RetryLadder::getRoutingKeyForAttempt($attempt);
        if ($routingKey === null) {
            // Retries exhausted, route to DLQ
            $this->publishDlq($notificationId, $attempt, $requestId, 'Exhausted retry ladder');

            return;
        }

        $this->sendToRoutingKey($routingKey, $notificationId, $attempt, $requestId);
    }

    /**
     * Publish delivery job to the dead-letter queue.
     */
    public function publishDlq(
        string $notificationId,
        int $attempt,
        ?string $requestId = null,
        ?string $reason = null
    ): void {
        $this->sendToRoutingKey(Topology::DLQ_ROUTING_KEY, $notificationId, $attempt, $requestId, $reason);
    }

    private function sendToRoutingKey(
        string $routingKey,
        string $notificationId,
        int $attempt,
        ?string $requestId = null,
        ?string $reason = null
    ): void {
        $requestId ??= RequestIdMiddleware::currentRequestId();

        $connection = RabbitConnection::getShared();
        $channel = $connection->channel();
        $channel->confirm_select();

        $payload = [
            'notificationId' => $notificationId,
            'attempt' => $attempt,
            'requestId' => $requestId,
        ];

        if ($reason !== null) {
            $payload['reason'] = $reason;
        }

        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}';

        $headers = [
            'x-attempt' => $attempt,
            'x-request-id' => $requestId,
        ];
        if ($reason !== null) {
            $headers['x-dlq-reason'] = $reason;
        }

        $message = new AMQPMessage($body, [
            'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
            'content_type' => 'application/json',
            'application_headers' => new AMQPTable($headers),
        ]);

        $channel->basic_publish($message, Topology::EXCHANGE, $routingKey);
        $channel->wait_for_pending_acks(5.0);
        $channel->close();
    }
}
