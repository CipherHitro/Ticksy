<?php

declare(strict_types=1);

namespace App\Infrastructure\Logging;

use App\Http\Middleware\RequestIdMiddleware;
use Monolog\Formatter\NormalizerFormatter;
use Monolog\LogRecord;

class JsonLogFormatter extends NormalizerFormatter
{
    public function __construct()
    {
        parent::__construct('Y-m-d\TH:i:s.v\Z');
    }

    public function format(LogRecord $record): string
    {
        $context = $record->context;

        // Mask PII if present in context
        if (isset($context['email'])) {
            $context['email'] = self::maskEmail((string) $context['email']);
        }
        if (isset($context['recipient'])) {
            $context['recipient'] = self::maskEmail((string) $context['recipient']);
        }

        // Never log sensitive credentials
        unset($context['password'], $context['token'], $context['authorization'], $context['apiKey'], $context['api_key'], $context['secret']);

        $requestId = $context['requestId'] ?? RequestIdMiddleware::currentRequestId();
        unset($context['requestId']);

        $output = [
            'timestamp' => $record->datetime->format('Y-m-d\TH:i:s.v\Z'),
            'level' => strtolower($record->level->getName()),
            'service' => 'notification',
            'requestId' => $requestId,
            'message' => $record->message,
        ];

        // Specific fields from domain/events
        foreach (['notificationId', 'template', 'eventId', 'eventType', 'userId', 'status', 'attempt'] as $field) {
            if (isset($context[$field])) {
                $output[$field] = $context[$field];
                unset($context[$field]);
            }
        }

        if (! empty($context)) {
            $output['context'] = $this->normalize($context);
        }

        if (! empty($record->extra)) {
            $output['extra'] = $this->normalize($record->extra);
        }

        return json_encode($output, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";
    }

    public static function maskEmail(?string $email): string
    {
        if (empty($email) || ! str_contains($email, '@')) {
            return '***';
        }

        [$local, $domain] = explode('@', $email, 2);
        if (strlen($local) <= 1) {
            $maskedLocal = $local.'***';
        } else {
            $maskedLocal = $local[0].'***';
        }

        return $maskedLocal.'@'.$domain;
    }
}
