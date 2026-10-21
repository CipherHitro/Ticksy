<?php

return [
    'port' => (int) env('PORT', 4006),

    'jwt' => [
        'jwks_url' => env('AUTH_JWKS_URL', 'http://auth-service:4001/.well-known/jwks.json'),
        'issuer' => env('JWT_ISSUER', 'ticksy-auth'),
        'audience' => env('JWT_AUDIENCE', 'ticksy-api'),
        'leeway' => 30, // seconds tolerance
        'jwks_cache_ttl' => 300, // 5 minutes
    ],

    'redis' => [
        'host' => env('REDIS_HOST', '127.0.0.1'),
        'port' => (int) env('REDIS_PORT', 6379),
        'password' => env('REDIS_PASSWORD'),
        'database' => (int) env('REDIS_DB', 0),
    ],

    'rabbitmq' => [
        'host' => env('RABBITMQ_HOST', '127.0.0.1'),
        'port' => (int) env('RABBITMQ_PORT', 5672),
        'user' => env('RABBITMQ_USER', 'guest'),
        'password' => env('RABBITMQ_PASSWORD', 'guest'),
        'vhost' => env('RABBITMQ_VHOST', '/'),
        'exchange' => 'notifications',
        'email_queue' => 'notifications.email',
        'dlq' => 'notifications.email.dlq',
        'prefetch' => (int) env('WORKER_PREFETCH', 2),
    ],

    'kafka' => [
        'brokers' => env('KAFKA_BROKERS', '127.0.0.1:9092'),
        'group_id' => env('KAFKA_GROUP_ID', 'notification-service'),
        'topics' => array_filter(explode(',', env('KAFKA_TOPICS', 'auth.events,booking.events,ledger.events,payment.events'))),
        'dlq_topic' => 'notifications.dlq',
        'max_event_age_hours' => (int) env('MAX_EVENT_AGE_HOURS', 72),
    ],

    'email' => [
        'driver' => env('EMAIL_DRIVER', 'log'),
        'resend' => [
            'api_key' => env('RESEND_API_KEY'),
            'webhook_secret' => env('RESEND_WEBHOOK_SECRET'),
            'max_rps' => (int) env('RESEND_MAX_RPS', 2),
            'base_url' => 'https://api.resend.com',
        ],
        'from' => [
            'address' => env('MAIL_FROM_ADDRESS', 'no-reply@mail.ticksy.local'),
            'name' => env('MAIL_FROM_NAME', 'Ticksy'),
        ],
    ],

    'display_timezone' => env('DISPLAY_TIMEZONE', 'Asia/Kolkata'),
    'base_url' => env('APP_BASE_URL', 'http://localhost:3000'),
];
