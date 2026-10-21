<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Notification\Status;
use App\Infrastructure\Redis\NotificationRepository;
use App\Infrastructure\Redis\SuppressionList;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ResendWebhookHandler
{
    private const DEDUPE_PREFIX = 'dedupe:webhook:';

    private const DEDUPE_TTL = 7 * 86400; // 7 days

    public function __construct(
        private readonly NotificationRepository $repository,
        private readonly SuppressionList $suppressionList
    ) {}

    /**
     * @param  array<string, mixed>  $event  Event payload from Resend
     * @return bool True if processed or duplicate; false if unhandled
     */
    public function handle(string $svixId, array $event): bool
    {
        // 1. Replay Deduplication (H-04)
        $dedupeKey = self::DEDUPE_PREFIX.$svixId;
        if (Cache::has($dedupeKey)) {
            Log::info("Duplicate webhook svix-id {$svixId} ignored", ['svixId' => $svixId]);

            return true;
        }

        Cache::put($dedupeKey, '1', self::DEDUPE_TTL);

        $type = (string) ($event['type'] ?? '');
        $data = (array) ($event['data'] ?? []);
        $emailId = ! empty($data['email_id']) ? (string) $data['email_id'] : null;

        if (empty($emailId)) {
            Log::info("Webhook event {$type} without email_id ignored", ['svixId' => $svixId]);

            return true;
        }

        // 2. Resolve Notification Record (H-06)
        $record = $this->repository->findByProviderMessageId($emailId);

        if (! $record) {
            // Try fallback via tags
            $notificationId = $this->extractNotificationIdFromTags($data['tags'] ?? []);
            if ($notificationId !== null) {
                $record = $this->repository->find($notificationId);
            }
        }

        if (! $record) {
            Log::info("Notification for Resend email {$emailId} not found, ignoring", [
                'emailId' => $emailId,
                'type' => $type,
            ]);

            return true;
        }

        // 3. Map Event Type to Target Status and Suppression
        $recipient = $this->extractRecipientEmail($data);

        switch ($type) {
            case 'email.sent':
                $this->repository->updateStatus($record->id, Status::SENT, isWebhook: true);
                break;

            case 'email.delivered':
                $this->repository->updateStatus($record->id, Status::DELIVERED, isWebhook: true);
                break;

            case 'email.delivery_delayed':
                $this->repository->updateStatus($record->id, Status::DELAYED, isWebhook: true);
                break;

            case 'email.bounced':
                if ($recipient !== null) {
                    $this->suppressionList->suppress($recipient, 'bounced', $record->id);
                }
                $this->repository->updateStatus($record->id, Status::BOUNCED, [
                    'failureCode' => 'BOUNCED',
                    'failureMessage' => 'Recipient mail provider rejected message (bounce)',
                ], isWebhook: true);
                break;

            case 'email.complained':
                if ($recipient !== null) {
                    $this->suppressionList->suppress($recipient, 'complained', $record->id);
                }
                $this->repository->updateStatus($record->id, Status::COMPLAINED, [
                    'failureCode' => 'COMPLAINED',
                    'failureMessage' => 'Recipient marked email as spam / complaint',
                ], isWebhook: true);
                break;

            case 'email.failed':
                $this->repository->updateStatus($record->id, Status::FAILED, [
                    'failureCode' => 'PROVIDER_FAILED',
                    'failureMessage' => 'Resend failed to deliver email',
                ], isWebhook: true);
                break;

            case 'email.suppressed':
                if ($recipient !== null) {
                    $this->suppressionList->suppress($recipient, 'suppressed', $record->id);
                }
                $this->repository->updateStatus($record->id, Status::SKIPPED, [
                    'failureCode' => 'SUPPRESSED',
                    'failureMessage' => 'Address is on Resend suppression list',
                ], isWebhook: true);
                break;

            default:
                Log::info("Unhandled Resend webhook event type '{$type}'", ['type' => $type]);
                break;
        }

        return true;
    }

    private function extractRecipientEmail(array $data): ?string
    {
        if (! empty($data['to']) && is_array($data['to']) && ! empty($data['to'][0])) {
            return (string) $data['to'][0];
        }

        if (! empty($data['to']) && is_string($data['to'])) {
            return $data['to'];
        }

        return null;
    }

    private function extractNotificationIdFromTags(mixed $tags): ?string
    {
        if (is_array($tags)) {
            // Can be associative array {"notification_id": "uuid"}
            if (isset($tags['notification_id'])) {
                return (string) $tags['notification_id'];
            }
            // Or array of objects [{"name": "notification_id", "value": "uuid"}]
            foreach ($tags as $tag) {
                if (is_array($tag) && ($tag['name'] ?? '') === 'notification_id' && ! empty($tag['value'])) {
                    return (string) $tag['value'];
                }
            }
        }

        return null;
    }
}
