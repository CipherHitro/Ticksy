# Ticksy — Notification Service

[![PHP](https://img.shields.io/badge/PHP-8.3%2B-blue.svg)](https://www.php.net/)
[![Laravel](https://img.shields.io/badge/Laravel-11-red.svg)](https://laravel.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

The **Notification Service** is the asynchronous communication engine for the Ticksy ticketing platform. It consumes domain events across Kafka topics (`auth.events`, `booking.events`, `ledger.events`, `payment.events`), enforces idempotency, evaluates user communication preferences and suppression records, queues delivery jobs into RabbitMQ, and dispatches transactional emails via the Resend REST API or local log driver.

---

## Architecture Overview

```
                                      Kafka Events
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      notification-kafka-consumer                        │
│               RdKafka\KafkaConsumer (group: notification-service)       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                              EventRouter                                │
│  • Enforces freshness (≤ 72h)                                          │
│  • Computes deterministic ID (UUIDv5 from eventId + template)          │
│  • Upserts Contact Directory (`contact:{userId}`)                      │
│  • Atomic Redis create (`notif:{id}`, status: QUEUED)                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Confirmed AMQP publish
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           RabbitMQ Topology                             │
│  Exchange: notifications (direct)                                      │
│  Main Queue: notifications.email (routing key: email)                  │
│  Retry Ladder: notifications.email.retry.{30s, 2m, 10m, 1h, 6h}        │
│  DLQ: notifications.email.dlq                                          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Prefetch = 2
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      notification-email-worker                          │
│  1. Atomic claim via Redis Lua (QUEUED → SENDING)                      │
│  2. Contact check (missing → retried 3x, then SKIPPED)                 │
│  3. Suppression check (`suppress:{sha256}`)                            │
│  4. User preferences check (`prefs:{userId}`)                          │
│  5. Blade HTML + Text template rendering & XSS/CRLF sanitization       │
│  6. Rate-limited send via Resend REST API (Idempotency-Key)            │
│  7. Status update (SENT) or scheduled retry ladder                     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                            Resend / Webhooks                           │
│  POST /api/v1/notifications/webhooks/resend (Svix signature verified) │
│  Updates: DELIVERED, BOUNCED (+ suppress), COMPLAINED (+ suppress)     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## System of Record (Redis Datastores & Keys)

The Notification Service deliberately **uses NO SQL database and NO migrations**. Redis (with AOF persistence and `noeviction`) is the authoritative datastore.

| Key Pattern | Type | Purpose / Description |
|---|---|---|
| `notif:{id}` | HASH | Notification record (status, template, recipient, attempts, timestamps) |
| `idx:user:{userId}` | ZSET | Index of notification IDs for user, score = timestamp in ms |
| `idx:status:{status}` | ZSET | Index of notification IDs by status (`QUEUED`, `SENDING`, `SENT`, etc.) |
| `idx:template:{template}` | ZSET | Index of notification IDs by template |
| `idx:all` | ZSET | Index of all notification IDs across the service |
| `provider:{emailId}` | STRING | Lookup mapping Resend email ID → internal notification UUID |
| `contact:{userId}` | HASH | Contact directory: email, name, role, last updated timestamp |
| `prefs:{userId}` | HASH | Notification preferences: `emailReminders`, `emailProductUpdates` |
| `suppress:{sha256}` | HASH | Suppression record (bounces/complaints): reason, masked email, timestamp |
| `idx:suppressions` | ZSET | Index of suppression hashes |
| `ratelimit:resend` | HASH | Token bucket state (`tokens`, `last_refill`) for Resend API rate limiting |

---

## Configuration & Environment Variables

All settings are configured via environment variables. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4006` | HTTP service port |
| `APP_ENV` | `local` | `local`, `testing`, `staging`, `production` |
| `APP_KEY` | *(generated)* | Laravel application encryption key (`artisan key:generate`) |
| `APP_DEBUG` | `false` | Always `false` in production (no stack traces leaked) |
| `LOG_LEVEL` | `info` | JSON structured log level (`debug`, `info`, `warning`, `error`) |
| `AUTH_JWKS_URL` | `http://auth-service:4001/.well-known/jwks.json` | Public JWKS endpoint for token verification |
| `JWT_ISSUER` | `ticksy-auth` | Expected JWT issuer |
| `JWT_AUDIENCE` | `ticksy-api` | Expected JWT audience |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | `null` | Redis password |
| `RABBITMQ_HOST` | `127.0.0.1` | RabbitMQ broker host |
| `RABBITMQ_PORT` | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_USER` | `guest` | RabbitMQ username |
| `RABBITMQ_PASSWORD` | `guest` | RabbitMQ password |
| `RABBITMQ_VHOST` | `/` | RabbitMQ virtual host |
| `WORKER_PREFETCH` | `2` | AMQP consumer QoS prefetch count |
| `KAFKA_BROKERS` | `127.0.0.1:9092` | Kafka bootstrap brokers |
| `KAFKA_GROUP_ID` | `notification-service` | Consumer group ID |
| `KAFKA_TOPICS` | `auth.events,booking.events,ledger.events,payment.events` | Inbound event topics |
| `MAX_EVENT_AGE_HOURS`| `72` | Freshness limit; older events are skipped with `SKIPPED STALE` |
| `EMAIL_DRIVER` | `log` | `log` for local mock, `resend` for live delivery |
| `RESEND_API_KEY` | *(empty)* | Resend API key (send-only, domain-restricted) |
| `RESEND_WEBHOOK_SECRET` | *(empty)* | Svix webhook secret for authenticating inbound status callbacks |
| `RESEND_MAX_RPS` | `2` | Outbound rate limiter RPS |
| `MAIL_FROM_ADDRESS` | `no-reply@mail.ticksy.local` | From address |
| `MAIL_FROM_NAME` | `Ticksy` | From sender name |
| `DISPLAY_TIMEZONE` | `Asia/Kolkata` | Timezone rendered in notification email bodies |
| `APP_BASE_URL` | `http://localhost:3000` | Frontend web URL for links inside email templates |

---

## API Endpoints

All public and authenticated routes are prefixed with `/api/v1/notifications`.

### Authenticated User Endpoints
- `GET /api/v1/notifications/me`: Paginated notification history for caller (newest first, metadata only). Query params: `page` (default 1), `limit` (default 20, max 50), `status`, `template`.
- `GET /api/v1/notifications/me/preferences`: Current email preferences (`emailReminders`, `emailProductUpdates`).
- `PUT /api/v1/notifications/me/preferences`: Update preferences. Body: `{"emailReminders"?: bool, "emailProductUpdates"?: bool}`. Reject unknown fields or attempts to disable transactional emails with `400 VALIDATION_ERROR`.

### Public Webhook
- `POST /api/v1/notifications/webhooks/resend`: Inbound status callback from Resend. Authenticated via `svix-id`, `svix-timestamp`, `svix-signature` headers.

### Admin Endpoints (`role: ADMIN` required)
- `GET /api/v1/notifications/admin/notifications`: Paginated notifications with filters (`status`, `template`, `userId`, `from`, `to`).
- `GET /api/v1/notifications/admin/notifications/{id}`: Full notification record including data payload.
- `POST /api/v1/notifications/admin/notifications/{id}/retry`: Re-enqueues a `FAILED` notification back to `QUEUED` for delivery. Returns `409 CONFLICT` if not failed.
- `GET /api/v1/notifications/admin/stats`: Aggregate status and template counts for the last 24h and 7d.
- `GET /api/v1/notifications/admin/suppressions`: List suppressed addresses.
- `DELETE /api/v1/notifications/admin/suppressions/{hash}`: Remove address from suppression list.

### Health & Metrics (Unprefixed)
- `GET /health/live`: Liveness probe (HTTP 200 `{"status": "UP"}`).
- `GET /health/ready`: Readiness probe verifying Redis and RabbitMQ connectivity (HTTP 200 or 503).
- `GET /metrics`: Prometheus plain-text exposition (`text/plain; version=0.0.4`).

---

## Commands & Background Processes

### 1. RabbitMQ Topology Setup
Initializes durable direct exchange, main delivery queue, and the 5-step dead-letter retry ladder:
```bash
php artisan rabbitmq:setup
```

### 2. Kafka Consumer Daemon
Consumes domain events, performs deduplication, upserts contact directory, and creates delivery intents:
```bash
php artisan notifications:consume-kafka
```

### 3. Email Delivery Worker
Claims notifications atomically from Redis and dispatches via Resend/Log:
```bash
php artisan notifications:work-email --prefetch=2
```

### 4. Sweepers & Schedulers
Recovers notifications stuck in `SENDING` (>10 min) due to worker interruptions:
```bash
php artisan notifications:sweep-stuck --threshold=600
```
Cleans expired index entries older than the retention window (90 days):
```bash
php artisan notifications:clean-retention --days=90
```
Manual test notification dispatcher:
```bash
php artisan notifications:send-test --template=welcome --to=delivered@resend.dev
```

---

## Testing & Quality Assurance

Run the test suite via Docker or native PHP 8.3+:

```bash
# Run all PHPUnit feature and unit tests (70 tests, 369 assertions)
docker run --rm -v $(pwd):/app -w /app composer:2 ./vendor/bin/phpunit

# Run code style formatting (Laravel Pint)
docker run --rm -v $(pwd):/app -w /app composer:2 ./vendor/bin/pint --test

# Run static analysis (Larastan / PHPStan Level 5)
docker run --rm -v $(pwd):/app -w /app composer:2 ./vendor/bin/phpstan analyse --memory-limit=1G

# Security audit
docker run --rm -v $(pwd):/app -w /app composer:2 composer audit
```

---

## Operational Runbooks

### 1. Replaying Events After Redis Data Loss
If Redis data is lost (`FLUSHALL`):
1. **Notification history** cannot be recovered without a Redis backup (AOF/RDB).
2. **Contact Directory** can be completely rebuilt by resetting the consumer offset on `auth.events` to `earliest`:
   ```bash
   kafka-consumer-groups --bootstrap-server $KAFKA_BROKERS --group notification-service \
     --topic auth.events --reset-offsets --to-earliest --execute
   ```
3. Restart `notifications:consume-kafka`. The freshness guard ensures welcome emails are **not** re-sent for stale events, while contacts are restored.

### 2. Recovering Stuck `SENDING` Jobs
If an email worker crashed mid-send:
Run the stuck sweeper:
```bash
php artisan notifications:sweep-stuck
```
Because every outbound call carries an `Idempotency-Key` equal to the internal `notificationId`, Resend prevents duplicate sends even if the previous request reached the provider.
