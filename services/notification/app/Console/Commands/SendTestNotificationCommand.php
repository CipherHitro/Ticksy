<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Notification\DeterministicId;
use App\Domain\Notification\TemplateRegistry;
use App\Infrastructure\Email\EmailGateway;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class SendTestNotificationCommand extends Command
{
    protected $signature = 'notifications:send-test 
                            {email : Recipient email address (e.g. delivered@resend.dev)}
                            {--template=welcome : Template name to send}';

    protected $description = 'Send a test notification email';

    public function handle(EmailGateway $gateway): int
    {
        $email = (string) $this->argument('email');
        $template = (string) $this->option('template');

        $this->info("Preparing test notification [{$template}] to {$email}...");

        $sampleEventId = (string) Str::uuid();
        $notificationId = DeterministicId::generate($sampleEventId, $template);

        $payload = match ($template) {
            'welcome' => [
                'userId' => (string) Str::uuid(),
                'email' => $email,
                'name' => 'Test User',
                'role' => 'ATTENDEE',
                'registeredAt' => now()->toIso8601ZuluString(),
            ],
            'booking-confirmation' => [
                'bookingId' => 'bkg-'.rand(1000, 9999),
                'userId' => (string) Str::uuid(),
                'eventId' => (string) Str::uuid(),
                'eventTitle' => 'Test Event Live in Mumbai',
                'totalAmountMinor' => 150000,
                'currency' => 'INR',
                'confirmedAt' => now()->toIso8601ZuluString(),
                'eventStartsAt' => now()->addDays(7)->toIso8601ZuluString(),
                'venueName' => 'Grand Arena',
                'venueCity' => 'Mumbai',
                'items' => [
                    ['seatLabel' => 'A-1', 'tierName' => 'VIP', 'priceMinor' => 150000],
                ],
            ],
            'refund-confirmation' => [
                'bookingId' => 'bkg-'.rand(1000, 9999),
                'userId' => (string) Str::uuid(),
                'eventTitle' => 'Test Event Live in Mumbai',
                'refundAmountMinor' => 150000,
                'currency' => 'INR',
                'refundedAt' => now()->toIso8601ZuluString(),
            ],
            'payout-completed' => [
                'organizerId' => (string) Str::uuid(),
                'payoutId' => 'po-'.rand(1000, 9999),
                'amountMinor' => 5000000,
                'currency' => 'INR',
                'completedAt' => now()->toIso8601ZuluString(),
            ],
            'payout-failed' => [
                'organizerId' => (string) Str::uuid(),
                'payoutId' => 'po-'.rand(1000, 9999),
                'amountMinor' => 5000000,
                'currency' => 'INR',
                'failedAt' => now()->toIso8601ZuluString(),
            ],
            'payment-failed' => [
                'paymentId' => 'pay-'.rand(1000, 9999),
                'bookingId' => 'bkg-'.rand(1000, 9999),
                'userId' => (string) Str::uuid(),
                'eventTitle' => 'Test Event Live in Mumbai',
                'amountMinor' => 150000,
                'currency' => 'INR',
                'failedAt' => now()->toIso8601ZuluString(),
            ],
            default => null,
        };

        if ($payload === null) {
            $this->error("Unknown template: {$template}");

            return 1;
        }

        $rendered = TemplateRegistry::render($template, $payload);

        $result = $gateway->send(
            $notificationId,
            $email,
            $rendered['subject'],
            $rendered['html'],
            $rendered['text'],
            $template
        );

        if ($result->status->value === 'SENT') {
            $this->info("Email sent successfully! Provider message ID: {$result->providerMessageId}");

            return 0;
        }

        if ($result->isTransient) {
            $this->warn("Transient send failure (retry in {$result->retryAfterSeconds}s): {$result->failureMessage}");

            return 2;
        }

        $this->error("Permanent send failure ({$result->failureCode}): {$result->failureMessage}");

        return 1;
    }
}
