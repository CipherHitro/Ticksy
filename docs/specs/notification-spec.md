# Notification Service: Build Spec (for AI agents)

Place at `docs/specs/notification.md`. Implements `services/notification/`.
Stack: **PHP 8.3+ / Laravel 13**, **Kafka** in, **RabbitMQ** for delivery jobs, **Redis** as system of record, **Resend** for email.

## 0. Rules for the agent

1. Read `AGENTS.md` first. It wins over this file on conventions (response envelope, error codes, JWT rules, naming, git, definition of done).
2. Work only inside `services/notification/`. Do **not** edit other services, `shared/`, `infra/docker/`, or `AGENTS.md`. List anything needed there under "Changes needed outside this service" (§4.3) in your final report.
3. Build in the milestone order of §11. After each milestone run its "done when" check and the relevant acceptance checks of §15 before moving on.
4. Money is integer minor units. Times are UTC internally. Never use floats for money.
5. Never commit secrets. Default `EMAIL_DRIVER=log` in dev and tests. Real sends happen only when `EMAIL_DRIVER=resend` is explicitly set, and automated tests must never call the real Resend API (use `Http::fake`). Real-send smoke tests are manual and limited to `resend.dev` test addresses.
6. Facts about Resend and package versions below came from docs at the time of writing. Verify against current official docs when you reach that step, and note differences in your report.
7. If this spec is ambiguous or conflicts with reality, stop and add the question to your report. Do not invent contracts.

## 1. Purpose and scope

Turn business events into emails (and keep a delivery record), reliably and exactly once from the user's point of view.

**In scope:** welcome, booking confirmation, refund confirmation, organizer payout completed/failed (and payment-failed as optional); per-user preferences; delivery tracking via Resend webhooks; suppression of bounced/complaining addresses; admin visibility and retry.

**Out of scope (design leaves room):** SMS (a `Channel` abstraction exists, only `EMAIL` is implemented; Indian SMS typically needs regulatory registration), push, marketing campaigns, PDF tickets, in-app realtime.

## 2. Stack and versions

| Item | Choice |
|---|---|
| Runtime | PHP **8.3+** (Laravel 13 requires 8.3), Laravel 13. If a required package doesn't support 13 yet, use the newest Laravel it supports and note it |
| HTTP/API | Laravel routes, Blade for templates, Pest for tests, Larastan + Pint for static analysis and format |
| Kafka client | `ext-rdkafka` used **directly** (`RdKafka\KafkaConsumer`) in an Artisan command. Do not depend on a wrapper package |
| RabbitMQ client | `php-amqplib` with an **explicit topology** (exchanges, retry queues with TTL, DLX, DLQ). Do not use Laravel's queue abstraction. It would hide the patterns we need to demonstrate |
| Redis client | `phpredis` (`ext-redis`) |
| Email | **Resend** REST API called through Laravel's `Http` client (full control of timeout, headers, error mapping). `resend/resend-php` may be used if it exposes the `Idempotency-Key` header; otherwise use raw HTTP |
| JWT | `firebase/php-jwt` with JWKS (RS256) |
| QR (stretch) | `endroid/qr-code` |
| Metrics | `promphp/prometheus_client_php` with the Redis storage adapter (PHP-FPM has no shared memory between requests) |
| PHP extensions | `rdkafka, redis, pcntl, opcache, mbstring, sockets` (+ `gd` for QR stretch) |

**No SQL database.** Laravel's skeleton defaults to database drivers: set `SESSION_DRIVER=array`, `CACHE_STORE=redis`, remove default migrations and the `User` model, set failed-jobs driver to `null`, never use Eloquent. Do not install Sanctum.

## 3. Architecture

```
auth.events ───┐
booking.events ─┼─► [kafka-consumer] ─► envelope check ─► freshness guard ─► handlers
ledger.events ──┤        │ commit offset only after step ▼ completes
payment.events ─┘        ▼
                Redis: contact directory, notification record (QUEUED)
                         │ publish (confirmed) 
                         ▼
          RabbitMQ  exchange `notifications` ─► queue notifications.email
                         │                        ▲  retry queues (TTL → DLX back to main)
                         ▼                        │
                  [email-worker] ─► claim (QUEUED→SENDING) ─► render Blade ─► Resend API
                         │                                      (Idempotency-Key = notificationId)
                         ▼ status SENT / retry / FAILED→DLQ
 Resend ── webhooks ─► POST /api/v1/notifications/webhooks/resend ─► DELIVERED / BOUNCED / COMPLAINED
                                                                     └► suppression list
 Clients ─ REST via gateway ─► /me, /me/preferences, /admin/*  (reads Redis)
```

**Why this split (state in the README):**
- **Kafka** carries domain events: facts, replayable, many consumers.
- **RabbitMQ** carries delivery jobs. A Kafka partition must not stall on a slow email provider, and RabbitMQ gives per-message retry with backoff, dead-lettering and rate-limited competing workers, which Kafka lacks natively.
- **Redis** (AOF persistence, `maxmemory-policy noeviction`) is the system of record for notification state. It is the one deliberate exception to "Redis is only a cache". Notification data is low-value and BASE-tolerant, and every send is protected by idempotency keys.

**Processes (one image, four commands):** `php-fpm` (+ nginx), `notifications:consume-kafka`, `notifications:work-email`, `schedule:work`.

## 4. Contracts

All events use the AGENTS.md §8 envelope (`eventId, eventType, occurredAt, aggregateId, aggregateVersion, requestId, payload`).

### 4.1 Inbound events

| Topic | `eventType` | Template | Recipient | Required payload fields |
|---|---|---|---|---|
| `auth.events` | `UserRegistered` | `welcome` | `userId` | `userId, email, name, role, registeredAt` (**also writes the contact directory**) |
| `auth.events` | `UserProfileUpdated` | none (updates directory) | n/a | `userId`, optional `email`, optional `name` |
| `booking.events` | `BookingConfirmed` | `booking-confirmation` | `userId` | `bookingId, userId, eventId, eventTitle, totalAmountMinor, currency, confirmedAt`; optional `eventStartsAt, venueName, venueCity, items[{seatLabel, tierName, priceMinor}]` |
| `booking.events` | `BookingRefunded` | `refund-confirmation` | `userId` | `bookingId, userId, eventTitle, refundAmountMinor, currency, refundedAt` |
| `ledger.events` | `PayoutCompleted` | `payout-completed` | `organizerId` | `organizerId, payoutId, amountMinor, currency, completedAt` |
| `ledger.events` | `PayoutFailed` | `payout-failed` | `organizerId` | `organizerId, payoutId, amountMinor, currency, failedAt` (never expose internal reasons in the email) |
| `payment.events` | `PaymentFailed` (optional) | `payment-failed` | `userId` | `paymentId, bookingId, userId, eventTitle, amountMinor, currency, failedAt` |

Rules:
- Unknown `eventType` → ignore, commit, count a metric. Unknown extra payload fields → ignore.
- The `organizerId` is also a user ID (JWT `sub`), so the same contact directory serves both.
- **Events carry only IDs, never emails**, except `auth.events`, which feeds the contact directory. Treat `auth.events` as containing PII (restrict access, never log payloads).

### 4.2 Outbound
None. The service publishes no events. Failed or unprocessable Kafka messages go to the Kafka topic `notifications.dlq` with headers (`x-source-topic, x-source-partition, x-source-offset, x-error`).

### 4.3 Changes needed outside this service (report them, do not make them)

1. **Auth owner:** publish `UserRegistered` and `UserProfileUpdated` to `auth.events` (outbox publisher).
2. **Booking owner:** add `eventStartsAt, venueName, venueCity, items[]` (optional) to `BookingConfirmed`, and `userId, eventTitle` to `BookingRefunded`. These are additive, so Ledger is unaffected.
3. **Ledger owner:** publish `PayoutCompleted` / `PayoutFailed` to `ledger.events` (optional L9 in the Ledger plan).
4. **Gateway owner:** route-table entries for `/api/v1/notifications/**`: `GET/PUT /me/**` required (any role), `/admin/**` required (ADMIN), `POST /webhooks/resend` **public with raw-body forwarding**, `/dev/**` blocked.
5. **AGENTS.md:** change the notification row from "no public prefix" to prefix `/api/v1/notifications`, port 4006, stack PHP 8.3/Laravel 13.
6. **Infra:** compose services `notification-redis` (AOF on, host port 6382), `notification-rabbitmq` (with management UI, 5672/15672); Kafka shared. Add DNS records for the Resend sending domain (SPF/DKIM) via Terraform. Secrets in SSM: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.
7. **`shared/events/`:** JSON Schemas for the payloads above.

## 5. Domain model

**Notification record** (Redis hash `notif:{id}`):
`id, userId, template, channel(EMAIL), category, status, attempts, sourceEventId, sourceEventType, idempotencyKey, providerMessageId, subject, data(JSON snapshot of event-derived fields only), maskedRecipient, createdAt, sentAt, deliveredAt, failedAt, failureCode, failureMessage`.
Do **not** store the full email address on the record. Resolve it from the contact directory at send time; keep only a masked form (`a***@gmail.com`) for display.

**Deterministic ID:** `id = UUIDv5(namespace, sourceEventId + ":" + template)`. Re-processing the same event overwrites nothing and creates nothing new. This is the primary dedupe.

**Statuses and allowed transitions:**

| From | To |
|---|---|
| QUEUED | SENDING, SKIPPED, FAILED |
| SENDING | SENT, QUEUED (retry scheduled), FAILED |
| SENT | DELIVERED, DELAYED, BOUNCED, COMPLAINED, FAILED |
| DELAYED | DELIVERED, BOUNCED, FAILED |
| DELIVERED | COMPLAINED |
| FAILED | QUEUED (admin retry only) |
| BOUNCED, COMPLAINED, SKIPPED | terminal |

Webhooks can arrive out of order: `delivered` may arrive before the worker records `SENT`. A transition request that would move backwards is ignored. A transition not in the table, but forward in rank (e.g. QUEUED → DELIVERED), is accepted only for webhook-driven updates, because it means the worker crashed after the provider accepted the mail.

**SKIPPED reasons:** `NO_CONTACT`, `OPTED_OUT`, `SUPPRESSED`, `STALE_EVENT`, `UNSUPPORTED_CURRENCY`.

**Categories and preferences:** `TRANSACTIONAL` (welcome, booking, refund, payout, payment-failed: cannot be disabled), `REMINDERS` (default on), `PRODUCT_UPDATES` (default off). Preferences hash `prefs:{userId}` has `emailReminders`, `emailProductUpdates`.

**Freshness guard:** an event older than `MAX_EVENT_AGE_HOURS` (default 72) never sends an email. It still updates the contact directory, and is recorded as `SKIPPED: STALE_EVENT`. This prevents emailing historical events when the consumer group starts from the earliest offset or after a long outage.

**Suppression:** `suppress:{sha256(lowercase email)}`. Created on `bounced` / `complained` / `suppressed` webhooks. Checked before every send.

## 6. Redis keys

| Key | Type | Purpose / TTL |
|---|---|---|
| `notif:{id}` | hash | record, 90 days |
| `idx:user:{userId}` | zset (score = createdAt ms) | user history, 90 days |
| `idx:status:{status}`, `idx:template:{template}`, `idx:all` | zset | admin filters (combine with `ZINTERSTORE` into a temp key with a short TTL) |
| `contact:{userId}` | hash `email,name,role,updatedAt` | no TTL |
| `prefs:{userId}` | hash | no TTL |
| `suppress:{hash}` | hash `reason,notificationId,at` | no TTL |
| `provider:{resendEmailId}` | string = notification id | 90 days |
| `dedupe:webhook:{svixId}` | string | 7 days |
| `rate:resend` | token bucket | outbound rate limit |
| `jwks:cache` | string | 5 minutes |
| `stats:{yyyymmdd}:{template}:{status}` | counter | 90 days |
| `reminders` (stretch) | zset (score = sendAt) | member = bookingId |

Atomic operations (claim `QUEUED→SENDING`, transition checks, index updates) use Lua scripts or `MULTI/EXEC`. Redis config: `appendonly yes`, `appendfsync everysec`, `maxmemory-policy noeviction`.

## 7. RabbitMQ topology

Declared idempotently by `php artisan rabbitmq:setup` (also run on worker start).

- Exchange `notifications` (direct, durable).
- Queue `notifications.email` (durable) bound with routing key `email`.
- Retry queues, **one per delay** (queue-level `x-message-ttl`, so there is no head-of-line blocking): `notifications.email.retry.30s`, `.2m`, `.10m`, `.1h`, `.6h`. Each has `x-dead-letter-exchange=notifications` and `x-dead-letter-routing-key=email`, and is bound to key `email.retry.<delay>`.
- Dead-letter queue `notifications.email.dlq` bound with key `email.dlq`.
- Messages: persistent, publisher confirms on, JSON body `{notificationId, attempt, requestId}`, header `x-attempt`.
- Consumer: manual ack, `prefetch` = `WORKER_PREFETCH` (default 2). Ack only after the Redis state is persisted.
- Failure policy: transient error → publish to the retry queue for attempt N (30s, 2m, 10m, 1h, 6h), then ack the original. After the last retry → status `FAILED`, publish to the DLQ, ack. Malformed body → DLQ, ack.

## 8. Resend integration

**One-time human setup (document in README):**
1. Create a Resend account. Add a **sending subdomain** (e.g. `mail.<yourdomain>`) to isolate reputation. Publish the DNS records Resend shows (Terraform/Route53). Wait for "verified".
2. Create an API key with **sending access only**, restricted to that domain.
3. Create a webhook pointing to `https://api.<domain>/api/v1/notifications/webhooks/resend`. Select `email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.failed, email.suppressed`. Copy the signing secret (`whsec_...`).
4. Before the domain is verified, only `onboarding@resend.dev` as sender works, and only to your own account address (others get 403).

**Free plan limits (verify):** 100 emails/day, 3000/month. The API rate limit is **per team across all keys and services**. Docs have shown 2, 5 and 10 requests/second at different times. Make it configurable (`RESEND_MAX_RPS`, default **2**) and also honor the rate-limit headers and `Retry-After`.

**Request** (`POST https://api.resend.com/emails`, `Authorization: Bearer <key>`):
`from` ("Ticksy <no-reply@mail.<domain>>"), `to` (single recipient), `subject`, `html`, **`text`** (always send both), optional `reply_to`, `headers: {"X-Entity-Ref-ID": notificationId}`, `tags: [{name:"template",value:...},{name:"notification_id",value:...}]` (tag values: ASCII letters, digits, `_`, `-`). Add header **`Idempotency-Key: notificationId`** (kept about 24 h). Timeouts: connect 3 s, total 10 s. Disable open/click tracking for transactional mail.

**Error mapping:**

| Response | Class | Action |
|---|---|---|
| 200 `{id}` | success | store `providerMessageId` + `provider:{id}` index, status `SENT` |
| network error, timeout, 5xx | transient | retry per §7 |
| 429 `rate_limit_exceeded` | transient | retry after `Retry-After` (min 1 s), without consuming a retry slot |
| 429 `daily_quota_exceeded` / `monthly_quota_exceeded` | transient, long | retry in 1 h, raise an alert metric |
| 409 `concurrent_idempotent_requests` | transient | retry |
| 409 `invalid_idempotent_request` | permanent (bug) | `FAILED`, log loudly |
| 400/401/403/422 (validation, invalid key, unverified domain, testing-only restriction) | permanent | `FAILED` immediately with a `failureCode`, no retry |

**Outbound rate limiting:** Redis token bucket at `RESEND_MAX_RPS`, shared by all workers. If no token is available, wait briefly or requeue without counting an attempt.

**Webhook endpoint** `POST /api/v1/notifications/webhooks/resend`:
1. Read the **raw body**. Require headers `svix-id`, `svix-timestamp`, `svix-signature`.
2. Reject if the timestamp is more than 5 minutes off.
3. Signature = base64(HMAC-SHA256(key, `"{svix-id}.{svix-timestamp}.{rawBody}"`)), where key = base64-decoded secret after the `whsec_` prefix. The header may hold several space-separated `v1,<sig>` values. Any one matching is valid. Use a constant-time comparison.
4. Bad signature → `401 UNAUTHENTICATED` (standard envelope). Duplicate `svix-id` → `200`, no effect.
5. Find the notification by `provider:{data.email_id}` (fallback: `notification_id` tag). Unknown → `200` and a log line.
6. Map: `email.sent`→SENT, `email.delivered`→DELIVERED, `email.delivery_delayed`→DELAYED, `email.bounced`→BOUNCED + suppress, `email.complained`→COMPLAINED + suppress, `email.failed`→FAILED, `email.suppressed`→suppress + mark. Ignore other types.
7. Respond `200` quickly (no slow work inline). Webhook payloads do not contain the email body.

**Test addresses:** `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`, `suppressed@resend.dev` (labels allowed, e.g. `delivered+order1@resend.dev`). They still count toward quotas.

## 9. REST API

Prefix `/api/v1/notifications`. Standard envelope, errors, pagination per AGENTS.md. Laravel adds `/api` automatically to `routes/api.php`; register health and metrics routes outside it so their paths are exactly `/health/live`, `/health/ready`, `/metrics`.

| Method | Route | Access | Notes |
|---|---|---|---|
| GET | `/me` | any authenticated | own history, newest first, filters `status`, `template`. Metadata only (no body) |
| GET | `/me/preferences` | any authenticated | defaults when unset |
| PUT | `/me/preferences` | any authenticated | body `{emailReminders?, emailProductUpdates?}` booleans. Unknown fields or any attempt to disable transactional → `400 VALIDATION_ERROR` |
| POST | `/webhooks/resend` | public (signature) | §8 |
| GET | `/admin/notifications` | ADMIN | filters `status, template, userId, from, to`, paginated |
| GET | `/admin/notifications/{id}` | ADMIN | full record |
| POST | `/admin/notifications/{id}/retry` | ADMIN | only `FAILED` → re-enqueue. Otherwise `409 CONFLICT` |
| GET | `/admin/stats` | ADMIN | counts by status and template for the last 24 h / 7 d |
| GET / DELETE | `/admin/suppressions`, `/admin/suppressions/{hash}` | ADMIN | list / remove |
| POST | `/dev/events`, `/dev/contacts` | dev only | inject an inbound envelope / seed a contact |
| GET | `/dev/preview/{template}` | dev only | render a template with sample data |

Identity always comes from the verified JWT `sub`. Domain error codes: `NOTIFICATION_NOT_FOUND` (404), `INVALID_STATE` (409). Never accept a `userId` for `/me/*`.

## 10. Project structure

```
services/notification/
├── app/
│   ├── Domain/          # Notification, Status (state machine), TemplateRegistry, Money, ids
│   ├── Application/     # EventRouter, handlers, NotificationService, SendEmail use case
│   ├── Infrastructure/
│   │   ├── Redis/       # NotificationRepository, ContactDirectory, PreferenceStore, SuppressionList, Lua/
│   │   ├── Kafka/       # ConsumerRunner, DlqProducer
│   │   ├── Rabbit/      # Topology, Publisher, Worker
│   │   └── Email/       # EmailGateway (interface), ResendEmailGateway, LogEmailGateway
│   ├── Http/            # Controllers, Middleware (RequestId, Jwt, Role), ExceptionRenderer
│   └── Console/         # consume-kafka, work-email, rabbitmq:setup, send-test, sweepers
├── resources/views/emails/   # <template>.blade.php and <template>.text.blade.php, layout partial
├── routes/ (api.php, web.php)  config/  tests/ (Unit, Feature, Integration)
├── Dockerfile  nginx.conf  .env.example  README.md
```

## 11. Build milestones

| # | Milestone | Done when |
|---|---|---|
| **N1** | **Scaffold + infra.** Laravel 13, extensions, compose services, `.env.example`, `PORT` binding, JSON logs to stderr with `requestId`, request-ID middleware, the exception renderer that produces the AGENTS envelope for **everything** (404, 405, malformed JSON, validation → `400`, unauthenticated, forbidden, 500), `/health/live` + `/health/ready` (Redis, RabbitMQ) | `curl /health/live` OK; any error returns the envelope |
| **N2** | **JWT + RBAC.** `firebase/php-jwt`, JWKS cached in Redis, RS256 only, check `iss/aud/exp` (30 s leeway), unknown `kid` refetch at most once a minute, role middleware | wrong-key/`alg:none`/HS256-confusion tokens → 401; ATTENDEE on `/admin` → 403 |
| **N3** | **Domain + Redis stores.** Status state machine (pure), deterministic IDs, repositories, contact directory, preferences, suppression, Lua claim script | unit tests for transitions; concurrent claim lets exactly one worker win |
| **N4** | **Templates.** Blade HTML + plain-text for every template, shared layout, `Money::format` (integer math, `₹1,500.00`), time shown in `DISPLAY_TIMEZONE` (default `Asia/Kolkata`), subject builder (strip CR/LF), preview command/endpoint | every template renders with sample data; HTML-injection test passes (escaped output) |
| **N5** | **Email gateway.** `EmailGateway` interface, `LogEmailGateway` (default), `ResendEmailGateway` with §8 request/idempotency/timeouts/error mapping, token-bucket limiter, `notifications:send-test` command | `Http::fake` tests cover every row of the error table; manual send to `delivered@resend.dev` works |
| **N6** | **RabbitMQ pipeline.** `rabbitmq:setup`, confirmed publisher, worker: claim → check suppression/prefs/contact → render → send → update status; retry ladder; DLQ; SIGTERM-safe | induced failures walk the retry queues and end in the DLQ; a redelivered message never double-sends |
| **N7** | **Event handlers.** Envelope validation (against `shared/events/` schemas when present), router by `eventType`, freshness guard, contact-directory updates, intent creation (deterministic ID, `QUEUED`, publish), `/dev/events` | injecting each event type produces the right record and exactly one queued job; replaying it changes nothing |
| **N8** | **Kafka consumer.** `RdKafka\KafkaConsumer`, group `notification-service`, `enable.auto.commit=false`, `auto.offset.reset=earliest`, commit **after** the Redis write and confirmed publish, poison messages to `notifications.dlq`, graceful shutdown | kill after enqueue but before commit → redelivery causes no duplicate email |
| **N9** | **Webhooks.** §8 verification, dedupe, transitions, suppression | signed fixtures drive every status; tampered/replayed requests are rejected |
| **N10** | **REST API.** §9 endpoints, pagination, filters, ownership rules | API acceptance checks pass |
| **N11** | **Sweepers and scheduler.** Stuck-`SENDING` sweeper (older than 10 min → re-enqueue; the idempotency key makes a re-send safe within ~24 h), retention cleanup, **stretch:** `event-reminder` 24 h before `eventStartsAt` (Redis zset; removed on refund) | a simulated worker crash mid-send recovers without a duplicate |
| **N12** | **Observability.** Metrics (§14), queue depth gauge (RabbitMQ management API or AMQP passive declare), Kafka lag, structured logs | `/metrics` has all series |
| **N13** | **Ship.** Dockerfile, nginx config, CI, Helm values, README | full pipeline green |

## 12. Configuration (names are expected; `.env.example` must list all)

`PORT=4006`, `APP_ENV`, `APP_KEY`, `APP_DEBUG=false`, `LOG_LEVEL`, `AUTH_JWKS_URL`, `JWT_ISSUER=ticksy-auth`, `JWT_AUDIENCE=ticksy-api`, `REDIS_HOST/PORT/PASSWORD`, `RABBITMQ_HOST/PORT/USER/PASSWORD/VHOST`, `KAFKA_BROKERS`, `KAFKA_GROUP_ID=notification-service`, `KAFKA_TOPICS=auth.events,booking.events,ledger.events,payment.events`, `EMAIL_DRIVER=log|resend`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `RESEND_MAX_RPS=2`, `MAX_EVENT_AGE_HOURS=72`, `WORKER_PREFETCH=2`, `DISPLAY_TIMEZONE=Asia/Kolkata`, `APP_BASE_URL` (for links in emails).
The service fails fast at boot if a required variable for the active driver is missing.
Pitfall: do not run `config:cache` at image build time. Env values would be baked in. Run it in the entrypoint, or skip it.

## 13. Security

- Verify JWTs and enforce roles inside this service (defense in depth). No `X-User-*` trust. No CORS headers (gateway only).
- Webhook signature check, timestamp tolerance, replay dedupe, constant-time compare. Optional ingress allowlist of Resend's webhook IPs.
- Blade `{{ }}` escaping only. Never `{!! !!}` with event data. Strip CR/LF from subjects (header injection).
- PII: emails only in `contact:*` and in transit to Resend. Mask in logs (`a***@gmail.com`). Never log API keys, webhook secrets, tokens, or `auth.events` payloads.
- Resend API key is send-only and domain-restricted. Secrets come from env (Kubernetes Secret via External Secrets). Nothing in git.
- Transactional emails only: no open/click tracking. Include a plain-text part.
- Container: non-root, read-only root filesystem (writable `storage/` and `bootstrap/cache` via emptyDir), pinned base image, `composer audit` clean.
- Dev endpoints return 404 unless `APP_ENV=local`, and are blocked at the gateway.

## 14. Observability

Metrics (`/metrics`): `notifications_created_total{template}`, `notifications_status_total{template,status}`, `email_send_duration_seconds`, `email_send_attempts_total{result}`, `resend_rate_limited_total`, `webhook_events_total{type,result}`, `kafka_messages_total{topic,result}`, `kafka_consumer_lag`, `rabbit_queue_depth{queue}`, `dlq_messages_total{source}`, `suppressed_total`. Logs: one JSON object per line with `timestamp, level, service="notification", requestId, message`, plus `notificationId, template, eventId` where relevant. `/health/ready` is 503 if Redis or RabbitMQ is unreachable.

## 15. Acceptance checks (the agent writes and runs these; tag tests with the ID)

**Unit (no I/O)**

| ID | Check |
|---|---|
| U-01 | Deterministic ID: same `(eventId, template)` → same UUID; different template → different |
| U-02 | State machine: every allowed transition works; every other one is rejected; backward webhook transitions ignored |
| U-03 | `Money::format`: 0 → `₹0.00`, 5 → `₹0.05`, 100000 → `₹1,000.00`, 99999 → `₹999.99`; no float math; non-INR prints code |
| U-04 | Time rendering converts UTC to `Asia/Kolkata` correctly, incl. a date-boundary case |
| U-05 | Every template renders HTML **and** text with sample data; missing required field → controlled error |
| U-06 | Event title `<script>alert(1)</script>` and `"><img src=x>` are escaped in HTML; subject with `\r\n` is sanitized |
| U-07 | Svix signature: valid passes; wrong secret, tampered body, old timestamp, multi-signature header (one valid) behave correctly |
| U-08 | Email masking helper; no full address in any log line produced by the test run |
| U-09 | Freshness guard: event older than `MAX_EVENT_AGE_HOURS` → SKIPPED STALE; fresh event passes |
| U-10 | Retry ladder: attempt → queue mapping `30s,2m,10m,1h,6h`, then FAILED |

**Resend gateway (`Http::fake`)**

| ID | Check |
|---|---|
| G-01 | Request has `Authorization`, `Idempotency-Key = notificationId`, `html` + `text`, tags, from/to/subject, timeouts set |
| G-02 | 200 → `SENT`, provider ID stored and indexed |
| G-03 | 5xx / timeout / connection error → transient retry |
| G-04 | 429 rate limit honors `Retry-After` and doesn't consume a retry slot. 429 daily quota → 1 h delay + alert metric |
| G-05 | 400/401/403/422 → `FAILED` immediately, no retry, `failureCode` set |
| G-06 | 409 concurrent → retry. 409 invalid idempotent request → `FAILED` + error log |
| G-07 | Token bucket never exceeds `RESEND_MAX_RPS` across 3 workers |
| G-08 | API key never appears in logs |

**Worker and RabbitMQ (real RabbitMQ + Redis)**

| ID | Check |
|---|---|
| W-01 | Topology matches §7 after `rabbitmq:setup` (idempotent on re-run) |
| W-02 | Happy path: QUEUED → SENT, one gateway call |
| W-03 | Same message delivered twice / two workers racing → exactly one send (claim script) |
| W-04 | Transient failure moves through the retry queues and re-arrives on the main queue after the TTL |
| W-05 | Exhausted retries → FAILED + DLQ message |
| W-06 | Malformed message → DLQ, worker keeps running |
| W-07 | Suppressed address, opted-out category, missing contact → SKIPPED with the right reason (missing contact retried 3× first) |
| W-08 | SIGTERM: current message finishes, ack sent, exit ≤ 30 s |
| W-09 | Kill the worker after Resend accepted but before the DB write → sweeper re-enqueues, Resend idempotency key prevents a second email |
| W-10 | Messages survive a RabbitMQ restart (persistent + durable) |

**Kafka consumer (real Kafka + RabbitMQ + Redis)**

| ID | Check |
|---|---|
| K-01 | Each inbound event type produces the right notification and exactly one job |
| K-02 | Same event delivered 5× → one notification, one email |
| K-03 | Kill after enqueue, before commit → redelivery, no duplicate |
| K-04 | Malformed JSON, missing field, bad UUID, wrong currency → `notifications.dlq` with headers, offset committed, consumer continues |
| K-05 | Unknown `eventType` ignored and committed |
| K-06 | `UserRegistered` writes the directory; `UserProfileUpdated` updates it; stale `UserRegistered` updates the directory but sends no welcome |
| K-07 | `BookingConfirmed` arriving before the contact exists is retried and succeeds after the contact arrives |
| K-08 | RabbitMQ down: no offset commit, no crash. After recovery all events processed |
| K-09 | Two consumer instances: no duplicate emails |
| K-10 | SIGTERM graceful: in-flight work done, offsets committed, consumer closed |

**Webhooks**

| ID | Check |
|---|---|
| H-01 | Valid signed `delivered` → DELIVERED. Out-of-order `delivered` before SENT recorded is accepted |
| H-02 | `bounced` → BOUNCED + suppression. Next event to that address → SKIPPED SUPPRESSED |
| H-03 | `complained` → COMPLAINED + suppression |
| H-04 | Replay of the same `svix-id` → `200`, no effect |
| H-05 | Bad signature / stale timestamp / missing headers → `401` envelope |
| H-06 | Unknown `email_id` → `200` + log. Unknown event type ignored |

**API and security (feature tests with a test JWKS)**

| ID | Check |
|---|---|
| A-01 | Every error is `{success:false, code, message, requestId}`, including 404, 405, bad JSON, 415, 413. Validation = `400 VALIDATION_ERROR` |
| A-02 | `X-Request-Id` echoed or generated, in logs and error bodies |
| A-03 | `GET /me` shows only the caller's notifications; pagination limits (`limit>50`, `page=0`) → 400 |
| A-04 | Preferences: defaults, update, unknown field → 400, disabling transactional → 400 |
| A-05 | Admin list filters and pagination. Retry works only for FAILED (else 409) |
| A-06 | No token / expired / wrong key / `alg:none` / HS256 confusion / wrong `iss` or `aud` → 401. ATTENDEE on admin → 403 |
| A-07 | Dev endpoints 404 outside local. No CORS headers. No stack traces or `X-Powered-By` leaking |
| A-08 | JSON conventions: camelCase, ISO-8601 UTC `Z`, uppercase enum strings, money as integers |

**Resilience and operations**

| ID | Check |
|---|---|
| R-01 | Start the service before Redis/RabbitMQ/Kafka: retries with backoff, becomes healthy, no manual restart |
| R-02 | Redis down: API 503 `UPSTREAM_UNAVAILABLE`, workers pause, nothing lost. Recovery resumes |
| R-03 | `FLUSHALL` is documented as data loss for notification history (contacts rebuild by replaying `auth.events` from earliest). Verify the contact-rebuild procedure |
| R-04 | Container: non-root, read-only FS works, healthy with env only, no secrets in `docker history` |
| R-05 | `composer audit`, Larastan max level, Pint, Semgrep, gitleaks, Trivy fs + image: no HIGH/CRITICAL fixable findings |
| R-06 | `.env.example` lists every variable the code reads. README covers setup, Resend steps, run commands, replay and DLQ procedures |
| R-07 | **Manual smoke (limited, ≤ 10 sends):** with `EMAIL_DRIVER=resend`, send to `delivered@resend.dev` → DELIVERED via webhook. `bounced@resend.dev` → BOUNCED + suppression |

**End-to-end scenario:** register a user (Auth publishes `UserRegistered`) → welcome email → inject `BookingConfirmed` → confirmation email with correct amount/time/seats → inject `BookingRefunded` → refund email → inject `PayoutCompleted` for an organizer → payout email → replay all four events → no new emails → bounce the recipient → next event SKIPPED SUPPRESSED → `GET /me` lists each notification with the right status.

## 16. Deployment notes

- One image, separate Deployments: `notification-api` (**pod with two containers: nginx + php-fpm**, a real multi-container pod), `notification-kafka-consumer` (replicas ≤ partition count), `notification-email-worker` (scale by RabbitMQ queue depth), scheduler (`schedule:work` or CronJob).
- Workers exit and restart after `--max-time` or N messages to contain PHP memory growth. Orchestrator restarts them.
- RabbitMQ (management UI on) and Redis (AOF) as StatefulSets with persistent volumes. Redis with `noeviction`.
- NetworkPolicy: the API pod accepts traffic from the gateway only. Workers egress to Kafka, RabbitMQ, Redis and `api.resend.com` only.
- Helm values: probes on `/health/live` and `/health/ready`, resource limits, secrets from Secret refs, pinned image tags (git SHA).

## 17. Decisions encoded here (the human may veto)

1. Kafka consumer uses `ext-rdkafka` directly. RabbitMQ uses explicit `php-amqplib` topology instead of Laravel queues.
2. Contact directory is built from `auth.events`. Other events carry only IDs.
3. Freshness guard of 72 hours suppresses emails for old events.
4. Missing contact is retried 3× before `SKIPPED: NO_CONTACT`.
5. Welcome email is transactional (cannot be disabled).
6. Resend rate limit defaults to 2 req/s until confirmed for your account.
7. Dev endpoints exist and are blocked at the gateway.

## 18. Final report (required)

1. Milestones completed, and pass/fail per check ID.
2. Fixes and notable design choices, with files.
3. Package versions actually used (Laravel, PHP, rdkafka, amqplib) and any compatibility workarounds.
4. "Changes needed outside this service" (§4.3) still open.
5. Resend facts that differed from this document.
6. Questions for the human.

**Done =** all checks pass in one clean full run, the service starts from a clean clone using only its README, and no secrets or unrelated changes are in the diff.
