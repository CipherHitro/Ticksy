<?php

declare(strict_types=1);

namespace App\Infrastructure\Email;

interface EmailGateway
{
    /**
     * Send an email through the gateway.
     */
    public function send(
        string $notificationId,
        string $to,
        string $subject,
        string $html,
        string $text,
        string $template
    ): SendResult;
}
