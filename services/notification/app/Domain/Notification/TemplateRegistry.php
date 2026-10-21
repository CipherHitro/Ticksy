<?php

declare(strict_types=1);

namespace App\Domain\Notification;

use App\Domain\Support\Money;
use App\Domain\Support\SubjectSanitizer;
use App\Domain\Support\TimeFormatter;
use App\Http\Exceptions\ApiException;
use Illuminate\Support\Facades\View;

class TemplateRegistry
{
    /**
     * @var array<string, list<string>>
     */
    private const REQUIRED_PAYLOAD_FIELDS = [
        'welcome' => ['userId', 'email', 'name', 'role', 'registeredAt'],
        'booking-confirmation' => ['bookingId', 'userId', 'eventId', 'eventTitle', 'totalAmountMinor', 'currency', 'confirmedAt'],
        'refund-confirmation' => ['bookingId', 'userId', 'eventTitle', 'refundAmountMinor', 'currency', 'refundedAt'],
        'payout-completed' => ['organizerId', 'payoutId', 'amountMinor', 'currency', 'completedAt'],
        'payout-failed' => ['organizerId', 'payoutId', 'amountMinor', 'currency', 'failedAt'],
        'payment-failed' => ['paymentId', 'bookingId', 'userId', 'eventTitle', 'amountMinor', 'currency', 'failedAt'],
    ];

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return array_keys(self::REQUIRED_PAYLOAD_FIELDS);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public static function validate(string $template, array $payload): void
    {
        if (! isset(self::REQUIRED_PAYLOAD_FIELDS[$template])) {
            throw ApiException::validation("Unknown email template '{$template}'");
        }

        $missing = [];
        foreach (self::REQUIRED_PAYLOAD_FIELDS[$template] as $field) {
            if (! array_key_exists($field, $payload) || $payload[$field] === null || $payload[$field] === '') {
                $missing[] = [
                    'field' => $field,
                    'message' => "Missing required field '{$field}' for template '{$template}'",
                ];
            }
        }

        if (! empty($missing)) {
            throw ApiException::validation("Template validation failed for '{$template}'", $missing);
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{html: string, text: string, subject: string}
     */
    public static function render(string $template, array $payload): array
    {
        self::validate($template, $payload);

        $appUrl = (string) config('notification.base_url', 'http://localhost:3000');
        $viewData = array_merge($payload, ['appUrl' => $appUrl]);

        // Template specific formatting
        switch ($template) {
            case 'welcome':
                $viewData['registeredAtFormatted'] = TimeFormatter::format((string) $payload['registeredAt']);
                $subject = "Welcome to Ticksy, {$payload['name']}!";
                break;

            case 'booking-confirmation':
                $viewData['totalAmountFormatted'] = Money::format((int) $payload['totalAmountMinor'], (string) $payload['currency']);
                $viewData['confirmedAtFormatted'] = TimeFormatter::format((string) $payload['confirmedAt']);
                if (! empty($payload['eventStartsAt'])) {
                    $viewData['eventStartsAtFormatted'] = TimeFormatter::format((string) $payload['eventStartsAt']);
                }
                if (! empty($payload['items']) && is_array($payload['items'])) {
                    $formattedItems = [];
                    foreach ($payload['items'] as $item) {
                        $item['priceFormatted'] = Money::format((int) ($item['priceMinor'] ?? 0), (string) $payload['currency']);
                        $formattedItems[] = $item;
                    }
                    $viewData['items'] = $formattedItems;
                }
                $subject = "Booking Confirmed: {$payload['eventTitle']} (#{$payload['bookingId']})";
                break;

            case 'refund-confirmation':
                $viewData['refundAmountFormatted'] = Money::format((int) $payload['refundAmountMinor'], (string) $payload['currency']);
                $viewData['refundedAtFormatted'] = TimeFormatter::format((string) $payload['refundedAt']);
                $subject = "Refund Processed: {$payload['eventTitle']}";
                break;

            case 'payout-completed':
                $viewData['amountFormatted'] = Money::format((int) $payload['amountMinor'], (string) $payload['currency']);
                $viewData['completedAtFormatted'] = TimeFormatter::format((string) $payload['completedAt']);
                $subject = "Payout Processed: {$viewData['amountFormatted']}";
                break;

            case 'payout-failed':
                $viewData['amountFormatted'] = Money::format((int) $payload['amountMinor'], (string) $payload['currency']);
                $viewData['failedAtFormatted'] = TimeFormatter::format((string) $payload['failedAt']);
                $subject = "Action Required: Payout Failed (#{$payload['payoutId']})";
                break;

            case 'payment-failed':
                $viewData['amountFormatted'] = Money::format((int) $payload['amountMinor'], (string) $payload['currency']);
                $viewData['failedAtFormatted'] = TimeFormatter::format((string) $payload['failedAt']);
                $subject = "Payment Failed: {$payload['eventTitle']}";
                break;

            default:
                throw ApiException::validation("Unknown template '{$template}'");
        }

        $sanitizedSubject = SubjectSanitizer::sanitize($subject);
        $viewData['subject'] = $sanitizedSubject;

        $html = View::make("emails.{$template}", $viewData)->render();
        $text = View::make("emails.{$template}-text", $viewData)->render();

        return [
            'html' => $html,
            'text' => $text,
            'subject' => $sanitizedSubject,
        ];
    }
}
