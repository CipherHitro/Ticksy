<?php

declare(strict_types=1);

namespace App\Domain\Event;

use App\Http\Exceptions\ApiException;
use Ramsey\Uuid\Uuid;

readonly class EventEnvelope
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        public string $eventId,
        public string $eventType,
        public string $occurredAt,
        public string $aggregateId,
        public int $aggregateVersion,
        public string $requestId,
        public array $payload,
    ) {}

    /**
     * Parse and validate inbound JSON payload against AGENTS.md §8 envelope.
     *
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        $requiredFields = ['eventId', 'eventType', 'occurredAt', 'aggregateId', 'aggregateVersion', 'requestId', 'payload'];
        $missing = [];

        foreach ($requiredFields as $field) {
            if (! array_key_exists($field, $data)) {
                $missing[] = $field;
            }
        }

        if (! empty($missing)) {
            throw ApiException::validation('Missing envelope fields: '.implode(', ', $missing));
        }

        if (! Uuid::isValid((string) $data['eventId'])) {
            throw ApiException::validation("Invalid eventId UUID: '{$data['eventId']}'");
        }

        if (! is_array($data['payload'])) {
            throw ApiException::validation('Envelope payload must be a JSON object');
        }

        return new self(
            eventId: (string) $data['eventId'],
            eventType: (string) $data['eventType'],
            occurredAt: (string) $data['occurredAt'],
            aggregateId: (string) $data['aggregateId'],
            aggregateVersion: (int) $data['aggregateVersion'],
            requestId: (string) $data['requestId'],
            payload: $data['payload'],
        );
    }
}
