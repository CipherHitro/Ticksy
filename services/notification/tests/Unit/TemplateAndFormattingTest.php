<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Notification\TemplateRegistry;
use App\Domain\Support\Money;
use App\Domain\Support\SubjectSanitizer;
use App\Domain\Support\TimeFormatter;
use App\Http\Exceptions\ApiException;
use App\Infrastructure\Logging\JsonLogFormatter;
use Tests\TestCase;

class TemplateAndFormattingTest extends TestCase
{
    /**
     * U-03: Money formatting rules.
     */
    public function test_u03_money_formatting(): void
    {
        $this->assertEquals('₹0.00', Money::format(0));
        $this->assertEquals('₹0.05', Money::format(5));
        $this->assertEquals('₹1,000.00', Money::format(100000));
        $this->assertEquals('₹999.99', Money::format(99999));
        $this->assertEquals('10.00 USD', Money::format(1000, 'USD'));
        $this->assertEquals('50.50 EUR', Money::format(5050, 'EUR'));
    }

    /**
     * U-04: Time rendering with timezone conversion and date-boundary.
     */
    public function test_u04_time_conversion_including_date_boundary(): void
    {
        // 2026-11-01 20:00:00 UTC -> +05:30 -> 2026-11-02 01:30:00 AM IST (Next Day!)
        $utc = '2026-11-01T20:00:00Z';
        $formatted = TimeFormatter::format($utc, 'Asia/Kolkata');

        $this->assertStringContainsString('02 Nov 2026', $formatted);
        $this->assertStringContainsString('01:30 AM', $formatted);
    }

    /**
     * U-05: Every template renders HTML and text with sample data.
     */
    public function test_u05_every_template_renders_html_and_text(): void
    {
        $templates = [
            'welcome' => [
                'userId' => '11111111-1111-4111-a111-111111111111',
                'email' => 'alice@example.com',
                'name' => 'Alice',
                'role' => 'ATTENDEE',
                'registeredAt' => '2026-11-01T10:00:00Z',
            ],
            'booking-confirmation' => [
                'bookingId' => 'bkg-12345',
                'userId' => '11111111-1111-4111-a111-111111111111',
                'eventId' => 'evt-999',
                'eventTitle' => 'Coldplay Live in Mumbai',
                'totalAmountMinor' => 500000,
                'currency' => 'INR',
                'confirmedAt' => '2026-11-01T12:00:00Z',
                'eventStartsAt' => '2026-11-15T18:00:00Z',
                'venueName' => 'DY Patil Stadium',
                'venueCity' => 'Navi Mumbai',
                'items' => [
                    ['seatLabel' => 'A-1', 'tierName' => 'VIP', 'priceMinor' => 500000],
                ],
            ],
            'refund-confirmation' => [
                'bookingId' => 'bkg-12345',
                'userId' => '11111111-1111-4111-a111-111111111111',
                'eventTitle' => 'Coldplay Live in Mumbai',
                'refundAmountMinor' => 500000,
                'currency' => 'INR',
                'refundedAt' => '2026-11-02T12:00:00Z',
            ],
            'payout-completed' => [
                'organizerId' => '22222222-2222-4222-a222-222222222222',
                'payoutId' => 'po-8888',
                'amountMinor' => 2500000,
                'currency' => 'INR',
                'completedAt' => '2026-11-03T10:00:00Z',
            ],
            'payout-failed' => [
                'organizerId' => '22222222-2222-4222-a222-222222222222',
                'payoutId' => 'po-8888',
                'amountMinor' => 2500000,
                'currency' => 'INR',
                'failedAt' => '2026-11-03T10:00:00Z',
            ],
            'payment-failed' => [
                'paymentId' => 'pay-777',
                'bookingId' => 'bkg-12345',
                'userId' => '11111111-1111-4111-a111-111111111111',
                'eventTitle' => 'Coldplay Live in Mumbai',
                'amountMinor' => 500000,
                'currency' => 'INR',
                'failedAt' => '2026-11-01T12:05:00Z',
            ],
        ];

        foreach ($templates as $template => $payload) {
            $rendered = TemplateRegistry::render($template, $payload);

            $this->assertNotEmpty($rendered['html'], "HTML empty for {$template}");
            $this->assertNotEmpty($rendered['text'], "Text empty for {$template}");
            $this->assertNotEmpty($rendered['subject'], "Subject empty for {$template}");
            $this->assertStringContainsString('<!DOCTYPE html>', $rendered['html']);
        }
    }

    /**
     * U-05: Missing required field causes controlled validation error.
     */
    public function test_u05_missing_field_throws_validation_error(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionCode(400);

        // Missing required confirmedAt
        TemplateRegistry::render('booking-confirmation', [
            'bookingId' => 'bkg-123',
            'userId' => 'user-1',
            'eventId' => 'evt-1',
            'eventTitle' => 'Concert',
            'totalAmountMinor' => 1000,
            'currency' => 'INR',
        ]);
    }

    /**
     * U-06: HTML injection escaping and subject sanitization.
     */
    public function test_u06_html_injection_escaping_and_subject_sanitizing(): void
    {
        $maliciousTitle = '<script>alert(1)</script> & "><img src=x onerror=alert(2)>';
        $payload = [
            'bookingId' => 'bkg-999',
            'userId' => 'usr-1',
            'eventId' => 'evt-1',
            'eventTitle' => $maliciousTitle,
            'totalAmountMinor' => 10000,
            'currency' => 'INR',
            'confirmedAt' => '2026-11-01T12:00:00Z',
        ];

        $rendered = TemplateRegistry::render('booking-confirmation', $payload);

        // Script and tags must be escaped in HTML
        $this->assertStringNotContainsString('<script>alert(1)</script>', $rendered['html']);
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $rendered['html']);
        $this->assertStringNotContainsString('<img src=x', $rendered['html']);
        $this->assertStringContainsString('&lt;img src=x', $rendered['html']);

        // Subject with \r and \n must be sanitized
        $subjectWithCrlf = "Booking Confirmed\r\nBcc: evil@attacker.com\r\nSubject: Injected";
        $sanitized = SubjectSanitizer::sanitize($subjectWithCrlf);
        $this->assertStringNotContainsString("\r", $sanitized);
        $this->assertStringNotContainsString("\n", $sanitized);
        $this->assertEquals('Booking Confirmed Bcc: evil@attacker.com Subject: Injected', $sanitized);
    }

    /**
     * U-08: Email masking helper.
     */
    public function test_u08_email_masking(): void
    {
        $this->assertEquals('a***@gmail.com', JsonLogFormatter::maskEmail('alice@gmail.com'));
        $this->assertEquals('r***@ticksy.com', JsonLogFormatter::maskEmail('rohit@ticksy.com'));
        $this->assertEquals('b***@resend.dev', JsonLogFormatter::maskEmail('bounced@resend.dev'));
    }
}
