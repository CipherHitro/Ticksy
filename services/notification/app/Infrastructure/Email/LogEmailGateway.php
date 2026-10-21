<?php

declare(strict_types=1);

namespace App\Infrastructure\Email;

use App\Infrastructure\Logging\JsonLogFormatter;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class LogEmailGateway implements EmailGateway
{
    public function send(
        string $notificationId,
        string $to,
        string $subject,
        string $html,
        string $text,
        string $template
    ): SendResult {
        $maskedTo = JsonLogFormatter::maskEmail($to);
        $providerMessageId = 'log_'.Str::uuid();

        Log::info("Simulated email send [{$template}] to {$maskedTo}", [
            'notificationId' => $notificationId,
            'template' => $template,
            'providerMessageId' => $providerMessageId,
            'subject' => $subject,
            'recipient' => $maskedTo,
        ]);

        return SendResult::success($providerMessageId);
    }
}
