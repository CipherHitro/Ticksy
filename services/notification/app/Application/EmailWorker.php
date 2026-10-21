<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Notification\SkippedReason;
use App\Domain\Notification\Status;
use App\Domain\Notification\TemplateRegistry;
use App\Http\Middleware\RequestIdMiddleware;
use App\Infrastructure\Email\EmailGateway;
use App\Infrastructure\Logging\JsonLogFormatter;
use App\Infrastructure\Observability\MetricsService;
use App\Infrastructure\Rabbit\Publisher;
use App\Infrastructure\Redis\ContactDirectory;
use App\Infrastructure\Redis\NotificationRepository;
use App\Infrastructure\Redis\PreferenceStore;
use App\Infrastructure\Redis\SuppressionList;
use Illuminate\Support\Facades\Log;
use PhpAmqpLib\Message\AMQPMessage;
use Throwable;

class EmailWorker
{
    public function __construct(
        private readonly NotificationRepository $repository,
        private readonly ContactDirectory $contactDirectory,
        private readonly PreferenceStore $preferenceStore,
        private readonly SuppressionList $suppressionList,
        private readonly EmailGateway $emailGateway,
        private readonly Publisher $publisher,
        private readonly ?MetricsService $metrics = null
    ) {}

    public function handleMessage(AMQPMessage $message): void
    {
        $bodyRaw = $message->getBody();
        $payload = json_decode($bodyRaw, true);

        if (! is_array($payload) || empty($payload['notificationId'])) {
            Log::error('Malformed email job received, routing to DLQ', ['raw' => $bodyRaw]);
            $this->publisher->publishDlq('malformed-message', 0, null, 'Malformed JSON payload');
            $message->ack();

            return;
        }

        $notificationId = (string) $payload['notificationId'];
        $attempt = (int) ($payload['attempt'] ?? 1);
        $requestId = ! empty($payload['requestId']) ? (string) $payload['requestId'] : RequestIdMiddleware::currentRequestId();

        RequestIdMiddleware::setRequestId($requestId);

        $record = $this->repository->find($notificationId);
        if (! $record) {
            Log::warning("Notification record {$notificationId} not found in Redis, acknowledging job", [
                'notificationId' => $notificationId,
            ]);
            $message->ack();

            return;
        }

        // Atomic claim (QUEUED -> SENDING)
        $claimed = $this->repository->claim($notificationId);
        if (! $claimed) {
            Log::info("Notification {$notificationId} could not be claimed (already claimed or terminal), acknowledging", [
                'notificationId' => $notificationId,
                'status' => $record->status->value,
            ]);
            $message->ack();

            return;
        }

        // 1. Resolve contact
        $contact = $this->contactDirectory->get($record->userId);
        if (! $contact || empty($contact['email'])) {
            if ($attempt < 3) {
                Log::warning("Contact not found for user {$record->userId}, scheduling retry {$attempt}", [
                    'notificationId' => $notificationId,
                    'attempt' => $attempt,
                ]);
                $this->repository->updateStatus($notificationId, Status::QUEUED);
                $this->publisher->publishRetry($notificationId, $attempt + 1, $requestId);
                $message->ack();

                return;
            }

            Log::warning('Contact missing after 3 attempts, marking SKIPPED: NO_CONTACT', [
                'notificationId' => $notificationId,
            ]);
            $this->repository->updateStatus($notificationId, Status::SKIPPED, [
                'failureCode' => SkippedReason::NO_CONTACT->value,
                'failureMessage' => 'Recipient contact information not found in directory',
            ]);
            $message->ack();

            return;
        }

        $recipientEmail = $contact['email'];
        $maskedEmail = JsonLogFormatter::maskEmail($recipientEmail);

        // 2. Check suppression
        if ($this->suppressionList->isSuppressed($recipientEmail)) {
            Log::info("Recipient {$maskedEmail} is suppressed, marking SKIPPED: SUPPRESSED", [
                'notificationId' => $notificationId,
            ]);
            $this->repository->updateStatus($notificationId, Status::SKIPPED, [
                'maskedRecipient' => $maskedEmail,
                'failureCode' => SkippedReason::SUPPRESSED->value,
                'failureMessage' => 'Recipient address is suppressed due to past bounces/complaints',
            ]);
            $message->ack();

            return;
        }

        // 3. Check preferences
        if (! $this->preferenceStore->allows($record->userId, $record->category)) {
            Log::info("User {$record->userId} opted out of {$record->category->value}, marking SKIPPED: OPTED_OUT", [
                'notificationId' => $notificationId,
            ]);
            $this->repository->updateStatus($notificationId, Status::SKIPPED, [
                'maskedRecipient' => $maskedEmail,
                'failureCode' => SkippedReason::OPTED_OUT->value,
                'failureMessage' => 'Recipient opted out of this category',
            ]);
            $message->ack();

            return;
        }

        // 4. Render template
        try {
            $rendered = TemplateRegistry::render($record->template, $record->data);
        } catch (Throwable $e) {
            Log::error("Template rendering failed: {$e->getMessage()}", [
                'notificationId' => $notificationId,
                'template' => $record->template,
            ]);
            $this->repository->updateStatus($notificationId, Status::FAILED, [
                'failureCode' => 'TEMPLATE_ERROR',
                'failureMessage' => $e->getMessage(),
            ]);
            $this->publisher->publishDlq($notificationId, $attempt, $requestId, 'Template error: '.$e->getMessage());
            $message->ack();

            return;
        }

        // 5. Send email via Gateway
        $sendStart = microtime(true);
        $sendResult = $this->emailGateway->send(
            $notificationId,
            $recipientEmail,
            $rendered['subject'],
            $rendered['html'],
            $rendered['text'],
            $record->template
        );
        $this->metrics?->observeEmailSendDuration(microtime(true) - $sendStart);

        if ($sendResult->status === Status::SENT) {
            $this->metrics?->emailSendAttempt('success');
            $this->repository->updateStatus($notificationId, Status::SENT, [
                'providerMessageId' => (string) $sendResult->providerMessageId,
                'subject' => $rendered['subject'],
                'maskedRecipient' => $maskedEmail,
            ]);
            $message->ack();

            return;
        }

        if ($sendResult->isTransient) {
            $this->metrics?->emailSendAttempt('transient_retry');
            if ($attempt <= 5) {
                Log::warning('Transient send failure, retrying job at attempt '.($attempt + 1), [
                    'notificationId' => $notificationId,
                    'attempt' => $attempt,
                ]);
                $this->repository->updateStatus($notificationId, Status::QUEUED);
                $this->publisher->publishRetry($notificationId, $attempt + 1, $requestId);
                $message->ack();

                return;
            }

            Log::error("Retries exhausted for {$notificationId}, moving to DLQ", [
                'notificationId' => $notificationId,
            ]);
            $this->repository->updateStatus($notificationId, Status::FAILED, [
                'failureCode' => 'EXHAUSTED_RETRIES',
                'failureMessage' => 'Exhausted maximum send attempts',
            ]);
            $this->metrics?->dlqMessage('rabbitmq');
            $this->publisher->publishDlq($notificationId, $attempt, $requestId, 'Exhausted retries');
            $message->ack();

            return;
        }

        // Permanent failure
        $this->metrics?->emailSendAttempt('failed');
        Log::error("Permanent email send failure for {$notificationId}: {$sendResult->failureMessage}", [
            'notificationId' => $notificationId,
            'code' => $sendResult->failureCode,
        ]);
        $this->repository->updateStatus($notificationId, Status::FAILED, [
            'failureCode' => $sendResult->failureCode ?? 'PERMANENT_SEND_ERROR',
            'failureMessage' => $sendResult->failureMessage ?? 'Email provider rejected message',
            'maskedRecipient' => $maskedEmail,
        ]);
        $this->publisher->publishDlq($notificationId, $attempt, $requestId, $sendResult->failureMessage);
        $message->ack();
    }
}
