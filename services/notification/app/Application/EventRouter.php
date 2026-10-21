<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Event\EventEnvelope;
use App\Domain\Notification\Category;
use App\Domain\Notification\DeterministicId;
use App\Domain\Notification\NotificationRecord;
use App\Domain\Notification\SkippedReason;
use App\Domain\Notification\Status;
use App\Domain\Notification\TemplateRegistry;
use App\Http\Exceptions\ApiException;
use App\Infrastructure\Logging\JsonLogFormatter;
use App\Infrastructure\Observability\MetricsService;
use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\ContactDirectory;
use App\Infrastructure\Redis\NotificationRepository;
use Illuminate\Support\Facades\Log;

class EventRouter
{
    public function __construct(
        private readonly NotificationRepository $repository,
        private readonly ContactDirectory $contactDirectory,
        private readonly Publisher $publisher,
        private readonly ?MetricsService $metrics = null
    ) {}

    public function handle(EventEnvelope $envelope): ?NotificationRecord
    {
        return match ($envelope->eventType) {
            'UserRegistered' => $this->handleUserRegistered($envelope),
            'UserProfileUpdated' => $this->handleUserProfileUpdated($envelope),
            'BookingConfirmed' => $this->handleBookingConfirmed($envelope),
            'BookingRefunded' => $this->handleBookingRefunded($envelope),
            'PayoutCompleted' => $this->handlePayoutCompleted($envelope),
            'PayoutFailed' => $this->handlePayoutFailed($envelope),
            'PaymentFailed' => $this->handlePaymentFailed($envelope),
            default => $this->handleUnknownEvent($envelope),
        };
    }

    private function handleUserRegistered(EventEnvelope $envelope): NotificationRecord
    {
        $payload = $envelope->payload;
        TemplateRegistry::validate('welcome', $payload);

        $userId = (string) $payload['userId'];
        $email = (string) $payload['email'];
        $name = (string) $payload['name'];
        $role = (string) $payload['role'];
        $registeredAt = (string) $payload['registeredAt'];

        // Always update the contact directory, even if stale (K-06)
        $this->contactDirectory->upsert($userId, $email, $name, $role, $registeredAt);

        $template = 'welcome';
        $notificationId = DeterministicId::generate($envelope->eventId, $template);
        $isStale = FreshnessGuard::isStale($envelope->occurredAt);

        $status = $isStale ? Status::SKIPPED : Status::QUEUED;
        $failureCode = $isStale ? SkippedReason::STALE_EVENT->value : null;
        $failureMessage = $isStale ? 'Event older than freshness limit, email skipped' : null;

        $record = new NotificationRecord(
            id: $notificationId,
            userId: $userId,
            template: $template,
            channel: 'EMAIL',
            category: Category::TRANSACTIONAL,
            status: $status,
            sourceEventId: $envelope->eventId,
            sourceEventType: $envelope->eventType,
            data: $payload,
            maskedRecipient: JsonLogFormatter::maskEmail($email),
            failureCode: $failureCode,
            failureMessage: $failureMessage,
        );

        $created = $this->repository->create($record);
        if (! $created) {
            Log::info("Duplicate UserRegistered event {$envelope->eventId} ignored", [
                'eventId' => $envelope->eventId,
                'notificationId' => $notificationId,
            ]);

            return $this->repository->find($notificationId);
        }

        if (! $isStale) {
            $this->publisher->publish($notificationId, 1, $envelope->requestId);
        }

        return $record;
    }

    private function handleUserProfileUpdated(EventEnvelope $envelope): null
    {
        $payload = $envelope->payload;
        if (empty($payload['userId'])) {
            throw ApiException::validation("Missing 'userId' in UserProfileUpdated payload");
        }

        $userId = (string) $payload['userId'];
        $email = ! empty($payload['email']) ? (string) $payload['email'] : null;
        $name = ! empty($payload['name']) ? (string) $payload['name'] : null;

        $this->contactDirectory->update($userId, $email, $name);

        Log::info("Contact directory updated for user {$userId}", ['userId' => $userId]);

        return null;
    }

    private function handleBookingConfirmed(EventEnvelope $envelope): NotificationRecord
    {
        $payload = $envelope->payload;
        TemplateRegistry::validate('booking-confirmation', $payload);
        $this->validateCurrency((string) $payload['currency']);

        return $this->createAndEnqueueNotification(
            envelope: $envelope,
            template: 'booking-confirmation',
            userId: (string) $payload['userId'],
            category: Category::TRANSACTIONAL,
            payload: $payload
        );
    }

    private function handleBookingRefunded(EventEnvelope $envelope): NotificationRecord
    {
        $payload = $envelope->payload;
        TemplateRegistry::validate('refund-confirmation', $payload);
        $this->validateCurrency((string) $payload['currency']);

        return $this->createAndEnqueueNotification(
            envelope: $envelope,
            template: 'refund-confirmation',
            userId: (string) $payload['userId'],
            category: Category::TRANSACTIONAL,
            payload: $payload
        );
    }

    private function handlePayoutCompleted(EventEnvelope $envelope): NotificationRecord
    {
        $payload = $envelope->payload;
        TemplateRegistry::validate('payout-completed', $payload);
        $this->validateCurrency((string) $payload['currency']);

        return $this->createAndEnqueueNotification(
            envelope: $envelope,
            template: 'payout-completed',
            userId: (string) $payload['organizerId'], // organizerId is the userId in contact directory
            category: Category::TRANSACTIONAL,
            payload: $payload
        );
    }

    private function handlePayoutFailed(EventEnvelope $envelope): NotificationRecord
    {
        $payload = $envelope->payload;
        TemplateRegistry::validate('payout-failed', $payload);
        $this->validateCurrency((string) $payload['currency']);

        return $this->createAndEnqueueNotification(
            envelope: $envelope,
            template: 'payout-failed',
            userId: (string) $payload['organizerId'],
            category: Category::TRANSACTIONAL,
            payload: $payload
        );
    }

    private function handlePaymentFailed(EventEnvelope $envelope): NotificationRecord
    {
        $payload = $envelope->payload;
        TemplateRegistry::validate('payment-failed', $payload);
        $this->validateCurrency((string) $payload['currency']);

        return $this->createAndEnqueueNotification(
            envelope: $envelope,
            template: 'payment-failed',
            userId: (string) $payload['userId'],
            category: Category::TRANSACTIONAL,
            payload: $payload
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function createAndEnqueueNotification(
        EventEnvelope $envelope,
        string $template,
        string $userId,
        Category $category,
        array $payload
    ): NotificationRecord {
        $notificationId = DeterministicId::generate($envelope->eventId, $template);
        $isStale = FreshnessGuard::isStale($envelope->occurredAt);

        $status = $isStale ? Status::SKIPPED : Status::QUEUED;
        $failureCode = $isStale ? SkippedReason::STALE_EVENT->value : null;
        $failureMessage = $isStale ? 'Event older than freshness limit, email skipped' : null;

        $record = new NotificationRecord(
            id: $notificationId,
            userId: $userId,
            template: $template,
            channel: 'EMAIL',
            category: $category,
            status: $status,
            sourceEventId: $envelope->eventId,
            sourceEventType: $envelope->eventType,
            data: $payload,
            failureCode: $failureCode,
            failureMessage: $failureMessage,
        );

        $created = $this->repository->create($record);
        if (! $created) {
            Log::info("Duplicate event {$envelope->eventId} for template {$template} ignored", [
                'eventId' => $envelope->eventId,
                'notificationId' => $notificationId,
            ]);

            return $this->repository->find($notificationId) ?? $record;
        }

        $this->metrics?->notificationCreated($template);

        if (! $isStale) {
            $this->publisher->publish($notificationId, 1, $envelope->requestId);
        }

        return $record;
    }

    private function handleUnknownEvent(EventEnvelope $envelope): null
    {
        Log::info("Unknown eventType '{$envelope->eventType}' received, ignoring and committing", [
            'eventId' => $envelope->eventId,
            'eventType' => $envelope->eventType,
        ]);

        return null;
    }

    private function validateCurrency(string $currency): void
    {
        if (strlen($currency) !== 3 || ! ctype_alpha($currency)) {
            throw ApiException::validation("Invalid 3-letter currency code: '{$currency}'");
        }
    }
}
