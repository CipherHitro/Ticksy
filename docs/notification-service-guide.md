# Ticksy Notification Service — End-to-End Architecture & Testing Guide

> A complete operational and architectural guide for the **Ticksy Notification Service**, explaining how events flow from microservices into customer inboxes, how reliability and idempotency are guaranteed, and how to test live webhooks using ngrok and Resend.

---

## Quick Answer: Your Webhook URL for Resend

Based on your active ngrok tunnel:
- **Base ngrok URL:** `https://b289-2402-3a80-467b-beb2-dd8c-b730-53b2-db51.ngrok-free.app`
- **Exact Webhook URL to enter in Resend:**
  ```
  https://b289-2402-3a80-467b-beb2-dd8c-b730-53b2-db51.ngrok-free.app/api/v1/notifications/webhooks/resend
  ```

### How to configure this in Resend:
1. Log in to the [Resend Dashboard](https://resend.com/webhooks).
2. Go to **Webhooks** $\to$ Click **Add Webhook**.
3. In **Endpoint URL**, paste:
   ```
   https://b289-2402-3a80-467b-beb2-dd8c-b730-53b2-db51.ngrok-free.app/api/v1/notifications/webhooks/resend
   ```
4. In **Events to listen to**, select:
   - `email.sent`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.bounced`
   - `email.complained`
5. Click **Add**.
6. Resend will display your **Signing Secret** (starts with `whsec_...`).
7. Copy that secret and add it to your `services/notification/.env` file:
   ```env
   RESEND_WEBHOOK_SECRET=whsec_your_actual_signing_secret_here
   ```
8. Ensure ngrok is forwarding to your Notification service port (**`4006`**):
   ```bash
   ngrok http 4006
   ```
   *(If you are running the API Gateway on port 8080 and ngrok points to 8080, the URL path is identical because the Gateway passes `/api/v1/notifications/**` unchanged).*

---

## 1. High-Level Architecture & Mental Model

In a microservice system, notifications should **never** slow down user checkouts or block transactional database operations. If someone books a ticket, their payment should succeed immediately; sending an email takes 500ms–2s and could fail if an external provider is down.

Ticksy solves this with a multi-tier decoupled pipeline:

```
[ Auth / Booking / Ledger / Payment ]
                 │
                 │ 1. Publishes Domain Events (Kafka)
                 ▼
    ┌─────────────────────────┐
    │   Kafka Consumer        │  Consumes auth.events, booking.events, etc.
    │   (notification-service)│  Validates event age & computes deterministic ID
    └────────────┬────────────┘
                 │
                 │ 2. Writes initial state (Redis) & Enqueues job (RabbitMQ)
                 ▼
    ┌─────────────────────────┐
    │   RabbitMQ Pipeline     │  Exchange: 'notifications' (direct)
    │   (Reliability Engine)  │  Queue: 'notifications.email' + 5-step Retry Ladder
    └────────────┬────────────┘
                 │
                 │ 3. Prefetches message (QoS = 2)
                 ▼
    ┌─────────────────────────┐
    │   Email Worker Daemon   │  • Atomic Lua claim (QUEUED → SENDING)
    │   (Worker Process)      │  • Check recipient contact, suppression & prefs
    │                         │  • Renders Blade templates (HTML + Text)
    │                         │  • Dispatches via Resend REST API (Rate limited: 2 RPS)
    └────────────┬────────────┘
                 │
                 │ 4. HTTP POST email with Idempotency-Key
                 ▼
         [ Resend API ] ─────────► [ Recipient Inbox ]
                 │
                 │ 5. Webhook delivery confirmation / bounce (Svix signed)
                 ▼
    ┌─────────────────────────┐
    │   POST /webhooks/resend │  • Verifies HMAC signature with timestamp tolerance
    │   (Webhook Controller)  │  • Updates state: DELIVERED, BOUNCED (+ suppress)
    └─────────────────────────┘
```

---

## 2. Why This Split? (Kafka vs RabbitMQ vs Redis)

| Component | Technology | Why we use it |
|---|---|---|
| **Domain Events** | **Kafka** | Carries business facts across services (`BookingConfirmed`, `UserRegistered`). Event log is immutable, replayable, and consumed by multiple services (Booking, Ledger, Notification) without coupling. |
| **Delivery Jobs** | **RabbitMQ** | Worker queues with **individual message ACKs**, exponential backoff retry ladder (`30s`, `2m`, `10m`, `1h`, `6h`), Dead Letter Queue (`DLQ`), and competing worker scalability. A slow external email provider will never stall a Kafka partition. |
| **System of Record** | **Redis** | **No SQL database!** Notification state is ephemeral/BASE-tolerant. Redis (with AOF persistence and `noeviction`) provides sub-millisecond atomic claims via Lua scripts, Sorted Sets (`ZSET`) for indexed queries and admin dashboards, and fast suppression checks. |

---

## 3. The Complete Lifecycle of an Email (Step-by-Step)

### Step 1: Inbound Domain Event Arrives
Booking Service publishes a `BookingConfirmed` event to Kafka:
```json
{
  "eventId": "a50c822e-13c5-4d7a-8f55-e41c6204dd12",
  "eventType": "BookingConfirmed",
  "occurredAt": "2026-10-21T18:30:00Z",
  "aggregateId": "91df6ea3-...",
  "aggregateVersion": 1,
  "requestId": "req-12345",
  "payload": {
    "bookingId": "BKG-7788",
    "userId": "usr-9900",
    "eventId": "evt-4455",
    "eventTitle": "Coldplay Music of the Spheres",
    "totalAmountMinor": 450000,
    "currency": "INR",
    "confirmedAt": "2026-10-21T18:30:00Z"
  }
}
```

### Step 2: Freshness Guard & Deterministic ID
1. **Freshness Guard:** Checks if `occurredAt` is older than 72 hours. If so, it marks the notification as `SKIPPED (STALE_EVENT)` so stale replays never spam users with years-old emails.
2. **Deterministic ID:** Generates a UUIDv5 from `(eventId, templateName)`. 
   - No matter how many times Kafka redelivers this event, the ID is mathematically identical.
   - Creating `notif:{id}` in Redis is idempotent.

### Step 3: Contact Directory Resolution
Events carry **user IDs, never email addresses** (to protect PII). The notification service maintains an internal Contact Directory in Redis (`contact:{userId}`) populated automatically from `auth.events` (`UserRegistered`, `UserProfileUpdated`).
- If a contact has not synced yet, the worker retries up to 3 times before setting `SKIPPED: NO_CONTACT`.

### Step 4: Atomic Claim (Redis Lua)
When an email worker picks up the job from RabbitMQ, it executes an atomic Lua script:
```lua
if redis.call('HGET', KEYS[1], 'status') == ARGV[1] then
    redis.call('HSET', KEYS[1], 'status', ARGV[2], 'updatedAt', ARGV[3])
    return 1
else
    return 0
end
```
- If 2 workers race on the same message, **only one** successfully moves it from `QUEUED` to `SENDING`. The loser aborts and ACKs the message.

### Step 5: Suppression & Preferences Check
Before sending any byte over the wire:
1. **Suppression List:** Checks if `suppress:{sha256(email)}` exists in Redis (from previous hard bounces or spam complaints). If present $\to$ status set to `SKIPPED (SUPPRESSED)`.
2. **User Preferences:** If the email is non-transactional (e.g. reminders, product updates), checks `prefs:{userId}`. If opted out $\to$ `SKIPPED (OPTED_OUT)`. Transactional emails (tickets, refunds) **cannot** be disabled.

### Step 6: Blade Template Rendering & Sanitization
- Renders dual-format email: **HTML** (`resources/views/emails/<template>.blade.php`) and **Plain-Text** (`resources/views/emails/<template>-text.blade.php`).
- **Money formatting:** Formatted using minor unit integer math (`450000` paise $\to$ `₹4,500.00`).
- **Timezone:** Timestamps converted to `DISPLAY_TIMEZONE` (default `Asia/Kolkata`).
- **Sanitization:** All inputs HTML-escaped via Blade `{{ }}`; subjects sanitized to strip `\r`, `\n`, `\0` (preventing SMTP/HTTP header injection).

### Step 7: Rate-Limited Outbound Dispatch via Resend
- Controlled by a Redis Token Bucket rate limiter adhering to `RESEND_MAX_RPS` (default: 2 requests/second).
- Request carries `Idempotency-Key: {notificationId}`.
- If Resend accepts (HTTP 200) $\to$ Status updated to `SENT`, Resend `email_id` indexed in `provider:{email_id}`.

### Step 8: Asynchronous Webhook Feedback
When the email is delivered or bounces, Resend calls our webhook:
- **Svix Signature Check:** Verifies HMAC-SHA256 signature using `RESEND_WEBHOOK_SECRET` within 300s clock drift.
- **Replay Protection:** Deduplicates on `svix-id` in cache.
- **State Transition:** 
  - `email.delivered` $\to$ status transitions to `DELIVERED`.
  - `email.bounced` $\to$ status transitions to `BOUNCED` + recipient added to `suppress:{hash}`.
  - `email.complained` $\to$ status transitions to `COMPLAINED` + recipient added to `suppress:{hash}`.

---

## 4. Endpoints Reference

### Public Webhook
| Method | Route | Description |
|---|---|---|
| `POST` | `/api/v1/notifications/webhooks/resend` | Inbound status webhook from Resend (Svix signature authenticated) |

### Authenticated User Endpoints (`Authorization: Bearer <jwt>`)
| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/notifications/me` | Caller's notification history (newest first, metadata only). Query params: `page` (default 1), `limit` (max 50), `status`, `template`. |
| `GET` | `/api/v1/notifications/me/preferences` | Get current notification preferences (`emailReminders`, `emailProductUpdates`). |
| `PUT` | `/api/v1/notifications/me/preferences` | Update preferences. Body: `{"emailReminders"?: bool, "emailProductUpdates"?: bool}`. |

### Admin Endpoints (`role: ADMIN` required)
| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/notifications/admin/notifications` | List all notifications across the platform with filters (`status`, `template`, `userId`, `from`, `to`). |
| `GET` | `/api/v1/notifications/admin/notifications/{id}` | Full notification record with payload data. |
| `POST` | `/api/v1/notifications/admin/notifications/{id}/retry` | Re-enqueues a `FAILED` notification back into RabbitMQ. (Returns 409 if status is not `FAILED`). |
| `GET` | `/api/v1/notifications/admin/stats` | Aggregated counts by status and template for the last 24 hours and 7 days. |
| `GET` | `/api/v1/notifications/admin/suppressions` | Paginated list of suppressed email hashes. |
| `DELETE` | `/api/v1/notifications/admin/suppressions/{hash}` | Remove an address from the suppression list. |

### Health & Observability (Unprefixed)
| Method | Route | Description |
|---|---|---|
| `GET` | `/health/live` | Process liveness probe (`{"status":"UP"}`). |
| `GET` | `/health/ready` | Readiness probe (verifies Redis and RabbitMQ connectivity; returns 503 if either is down). |
| `GET` | `/metrics` | Prometheus plain-text metrics (`text/plain; version=0.0.4`). |

---

## 5. Step-by-Step Testing Guide

### A. Testing Without Webhooks (Local Dev / CLI)

You can trigger a real test notification directly from your terminal using the Artisan command:

```bash
# 1. Start RabbitMQ and Redis
docker compose -f infra/docker/docker-compose.infra.yml --profile gateway up -d

# 2. Setup RabbitMQ topology (exchanges, queues, retry ladder)
php artisan rabbitmq:setup

# 3. Dispatch a test notification (e.g. to Resend delivered test address)
php artisan notifications:send-test --template=welcome --to=delivered@resend.dev

# 4. Run the worker to process and send the queued email
php artisan notifications:work-email --once
```

### B. Testing With Webhooks via ngrok

Follow this exact flow to test webhook callbacks from Resend to your local machine:

1. **Verify your `.env` settings:**
   ```env
   EMAIL_DRIVER=resend
   RESEND_API_KEY=re_your_api_key_here
   RESEND_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

2. **Start the Laravel API server:**
   ```bash
   php artisan serve --port=4006
   ```

3. **Verify ngrok is running and forwarding to port 4006:**
   ```bash
   ngrok http 4006
   ```
   *Your ngrok tunnel will show: `https://b289-2402-3a80-467b-beb2-dd8c-b730-53b2-db51.ngrok-free.app` $\to$ `http://localhost:4006`.*

4. **Verify the endpoint is reachable from the public internet:**
   In your terminal, test a quick ping:
   ```bash
   curl -i -X POST https://b289-2402-3a80-467b-beb2-dd8c-b730-53b2-db51.ngrok-free.app/api/v1/notifications/webhooks/resend
   ```
   You should receive:
   ```json
   {
     "success": false,
     "code": "UNAUTHENTICATED",
     "message": "Missing Svix signature headers",
     "requestId": "..."
   }
   ```
   *(This confirms ngrok is forwarding properly and the signature validator is active!)*

5. **Send a test email to Resend's test recipient:**
   ```bash
   php artisan notifications:send-test --template=booking-confirmation --to=delivered@resend.dev
   php artisan notifications:work-email --once
   ```

6. **Watch the Webhook Callback:**
   - Within 2–5 seconds, Resend will send an `email.delivered` HTTP POST to:
     `https://b289-2402-3a80-467b-beb2-dd8c-b730-53b2-db51.ngrok-free.app/api/v1/notifications/webhooks/resend`
   - In your `ngrok` terminal or web dashboard (`http://localhost:4040`), you will see:
     `POST /api/v1/notifications/webhooks/resend 200 OK`
   - Your notification status in Redis will transition from `SENT` $\to$ `DELIVERED`.

7. **Test Automatic Bounce & Suppression:**
   Send an email to Resend's designated bounce test address:
   ```bash
   php artisan notifications:send-test --template=welcome --to=bounced@resend.dev
   php artisan notifications:work-email --once
   ```
   - Resend triggers an `email.bounced` webhook.
   - The service updates status to `BOUNCED` and places the email hash into `suppress:{hash}`.
   - Any future email sent to `bounced@resend.dev` will immediately be marked as `SKIPPED (SUPPRESSED)` without wasting Resend API quota!

---

## 6. Scheduled Sweepers & Maintenance

The notification service includes automated sweepers registered in `routes/console.php`:

| Command | Schedule | Purpose |
|---|---|---|
| `php artisan notifications:sweep-stuck` | Every 5 minutes | Finds notifications stuck in `SENDING` state for > 10 minutes (due to an unexpected worker crash) and re-enqueues them. Because every email uses an `Idempotency-Key`, Resend guarantees no recipient gets double-emailed. |
| `php artisan notifications:clean-retention` | Daily | Cleans up orphaned sorted-set index entries older than the 90-day retention window. |
