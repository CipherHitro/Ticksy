# Catalog and Booking: Verification Spec (for AI agents)

Place at `docs/specs/catalog-booking-verification.md`. Targets `services/catalog/` (Python/FastAPI/MongoDB) and `services/booking/` (Java/Spring Boot/MySQL/Redis), their integration with each other and with Payment, Ledger, Notification and the gateway, and the proof that the **course assignment requirements** are met.

## 0. Rules for the agent

1. Read first: `AGENTS.md`, `docs/specs/catalog.md`, `docs/specs/booking.md`, `docs/specs/gateway.md`, this file. `AGENTS.md` wins on conventions. If anything is ambiguous, list it under "Questions for the human". Do not guess silently.
2. **Where you may edit:** `services/catalog/` and `services/booking/` (fix defects, add tests). Cross-service tests go in `tests/e2e/` (a new shared folder: flag it in the report so both owners approve). Do **not** edit other services, `shared/`, `infra/docker/`, `AGENTS.md`, or the gateway. Report gaps there.
3. **Write missing tests yourself.** Tag each with its ID (pytest marker `@pytest.mark.test_id("CAT-01")`, JUnit `@Tag("BKG-01")`).
4. **Fix root causes in service code.** Never weaken, skip or delete a test to make it pass. Never add "skip auth" flags, never hard-code expected values into production code. Change a test only if it is demonstrably wrong against this spec, and say so.
5. Loop: run → diagnose → fix → re-run the group → re-run everything. If the same failure survives 3 attempts, stop and report the diagnosis.
6. **Phases.** Checks are tagged `(P1)` core, `(P2)` events/outbox/cache/RabbitMQ, `(P3)` payment saga and refunds, `(S)` should. Untagged = P1 MUST. If a feature of a phase is not built yet, report it as `NOT_IMPLEMENTED` (not a failure). Implement missing **P1/P2 features that `docs/specs/` clearly define**. Do **not** start P3 or stretch features unless the human says so.
7. **Missing dependencies.** If Payment, Ledger or Notification are not built, use stubs (a scripted Payment gRPC server and Kafka test producers). Mark checks that truly need the real service `N/A (dependency)`.
8. Safety: destructive/chaos tests only against local compose/Testcontainers. Never `docker system prune`, never touch other services' containers or volumes, never target a deployed environment. Use throwaway test RSA keys. Never commit secrets.
9. Behaviors here that go beyond existing code are acceptance criteria. If current behavior differs and seems reasonable, report a DECISION (§9) and follow this spec unless told otherwise.

## 1. Environment and tooling

- **Catalog tests:** Python 3.12, pytest, pytest-asyncio, httpx, Testcontainers (MongoDB **as a single-node replica set**, Redis, Kafka), `grpcio` client, `grpcurl`, `buf`, `ruff`, `mypy`/`pyright`, `pip-audit`, `bandit`.
- **Booking tests:** Java 21, JUnit 5, Spring Boot Test, Testcontainers (MySQL 8, Redis, Kafka, RabbitMQ), an in-process gRPC **Catalog stub** and **Payment stub**, Awaitility, `./mvnw verify`.
- **System/e2e:** docker compose (profiles `auth catalog booking gateway`, plus Kafka, RabbitMQ, Kafka Connect + Debezium, Consul, Prometheus/Grafana/Loki/Jaeger when they exist), `kcat`, `jq`, `curl`, `k6`, Toxiproxy (fault injection), `kind` or k3s for cluster checks.
- **Auth in tests:** generate an RSA key pair per run, serve a JWKS from a test HTTP server, mint tokens with `sub, email, name, role, iss=ticksy-auth, aud=ticksy-api, iat, exp`. Never call the real Auth service in unit/integration tests.
- **Time:** inject a clock in both services (`Clock` in Java, a time provider in Python). No raw `now()` in business logic.
- **Defaults assumed:** `HOLD_TTL_SECONDS=600` (tests override to 5), `MAX_SEATS_PER_BOOKING=6`, expiry job every 30 s (tests override to 1 s).
- **Assumed payment event contracts** (verify with the Payment owner): `PaymentSucceeded {paymentId, bookingId, userId, amountMinor, currency, providerPaymentId, paidAt}`, `PaymentFailed {paymentId, bookingId, userId, amountMinor, currency, reason, failedAt}`, `RefundIssued {refundId, paymentId, bookingId, amountMinor, currency, issuedAt}`.
- **Order:** Common (C) → Catalog (CAT) → Booking (BKG) → Integration (INT) → Assignment (ASG) → Demo.

## 2. Common checks (apply to BOTH services; run each service through them)

| ID | Check | Expected |
|---|---|---|
| C-01 | Success envelope `{success:true,data}`; lists add `meta{page,limit,total}`; create = 201, no body = 204 | yes |
| C-02 | **Every** error is `{success:false,code,message,requestId}`, including unknown route 404, 405, malformed JSON 400, 415, oversized body 413, framework validation (FastAPI's 422 must be `400 VALIDATION_ERROR`), Spring Security 401/403 (custom entry point and denied handler) | yes |
| C-03 | `X-Request-Id` echoed, generated if absent, present in logs and error bodies, forwarded on outbound gRPC (`x-request-id` metadata) and into event envelope `requestId` | yes |
| C-04 | JSON conventions: camelCase, ISO-8601 UTC `Z`, uppercase enum strings (category slugs lowercase), UUID strings, money as integers named `...Minor`, no floats or scientific notation | asserted over all responses |
| C-05 | Pagination: defaults 1/20; `limit` 0 or >50, `page` 0, non-numeric → `400 VALIDATION_ERROR` | yes |
| C-06 | Health paths exactly `/health/live` and `/health/ready`, no auth. Ready is 503 when a hard dependency is down. Port from `PORT` | yes |
| C-07 | **JWT matrix** on every protected route class: no token; malformed header; expired by 60 s (accepted at 10 s inside skew); wrong signing key; `alg:none`; **HS256 signed with the RSA public key as secret** (algorithm confusion); wrong `iss`; wrong `aud`; unknown `kid` (JWKS refetched at most once a minute); JWKS unreachable at start (fails closed, recovers without restart) | all `401 UNAUTHENTICATED` except the accepted-skew case |
| C-08 | Identity comes only from `sub`. Client-supplied `userId/organizerId/status/price/role` in bodies, queries or `X-User-*` headers is ignored or rejected | yes |
| C-09 | No stack traces, SQL, hostnames, server versions in any response. No `Access-Control-*` headers (gateway only). `X-Content-Type-Options: nosniff` | yes |
| C-10 | JSON logs to stdout: `timestamp, level, service, requestId, message`. No tokens, `Authorization`, passwords or PII anywhere in logs after the full test run | grep clean |
| C-11 | Graceful shutdown: SIGTERM finishes in-flight requests, stops consumers/schedulers, exits ≤ 30 s | yes |
| C-12 | Start the service **before** its dependencies: retries with backoff, becomes healthy, no manual restart | yes |
| C-13 | Container: multi-stage, non-root, pinned base tags, works with read-only root FS (writes only `/tmp`), no secrets in `docker history`, healthy with env only | yes |
| C-14 | Supply chain: gitleaks (full history), Semgrep (language packs), Trivy fs + config + image, hadolint, language audit (`pip-audit` / OWASP dependency-check or OSV-Scanner) | no HIGH/CRITICAL fixable findings |
| C-15 | `.env.example` lists every env var the code reads. README: run, test, env, routes, events produced/consumed. Starts from a clean clone with only the README | yes |
| C-16 | No money as float/double anywhere. No `TODO/FIXME`/debug leftovers. Lint and type checks clean | yes |

## 3. Catalog service

**Feature checklist (report each as PRESENT / MISSING):** (P1) event CRUD with DRAFT→PUBLISHED→CANCELLED lifecycle, owner/admin rules, tiers, search and filters, `/my/events`, categories, read-only GraphQL, gRPC `GetEventForBooking`, MongoDB replica set + indexes; (P2) `catalog.events` publishing (change streams), Redis cache; (S) poster upload, geo search.

### 3.1 Business rules (REST + real MongoDB)

| ID | Check | Expected |
|---|---|---|
| CAT-01 | ORGANIZER creates event | 201 `DRAFT`, `organizerId = sub`, `organizerName` from token `name`, server-generated `tierId`s (client-supplied ignored), unique slug, `version 1`, UTC timestamps |
| CAT-02 | Same title created 10× in parallel | 10 distinct slugs, no 500, no duplicate-key leak |
| CAT-03 | Validation: blank title, bad category, `endsAt <= startsAt`, negative price, capacity ≤ 0, non-INR currency, `priceMinor` as float/string, tier `seatPrefix` not `^[A-Z]{1,4}$`, **duplicate `seatPrefix` within an event** (seat labels would collide in Booking), >20 tiers, oversized title/description | `400 VALIDATION_ERROR` with `details` |
| CAT-04 | ATTENDEE create → 403. No token → 401. ADMIN create → allowed | yes |
| CAT-05 | Publish valid draft | `PUBLISHED`, `publishedAt` set |
| CAT-06 | Publish invalid (no tiers, start in the past, capacity 0) | `400`, `details` names every failed rule |
| CAT-07 | Publish twice / cancel a CANCELLED event | `409 INVALID_EVENT_STATE` |
| CAT-08 | After publish: change `title/description/posterUrl` OK. Change tiers, venue, dates, category → `409 EVENT_FIELD_LOCKED` | yes |
| CAT-09 | Cancel from DRAFT and from PUBLISHED OK | `CANCELLED` |
| CAT-10 | Delete DRAFT → 204. Delete PUBLISHED/CANCELLED → `409`. Unknown → 404 | yes |
| CAT-11 | Ownership: organizer B update/publish/cancel/delete A's event → 403. ADMIN allowed | yes |
| CAT-12 | Visibility: non-owner GET of DRAFT/CANCELLED → 404. Lists exclude them. Owner and ADMIN see them | yes |
| CAT-13 | Two parallel PUTs on one event | no lost update: both applied sequentially or one gets `409`; `version` equals number of successful updates |
| CAT-14 | Mass assignment: body sets `organizerId, status, slug, version, publishedAt, tierId` | ignored or `400`, never applied |
| CAT-15 | `posterUrl` accepts only `https://` URLs. `javascript:`, `file:`, `data:` rejected | yes |

### 3.2 Search and read APIs

| ID | Check | Expected |
|---|---|---|
| CAT-20 | `GET /events` returns PUBLISHED events only. Filters `q, category, city (case-insensitive), from, to, minPrice, maxPrice, organizerId` each work alone and combined. Price filters use the event's lowest tier price (`fromPriceMinor`, present in every list item) | correct, `meta.total` exact |
| CAT-21 | `sort=startsAt/-startsAt/createdAt/-createdAt/fromPriceMinor` work. Unknown sort → 400 | yes |
| CAT-22 | Text search `q` finds by title, description and tags, ranked by relevance. `q` longer than 100 chars → 400 | yes |
| CAT-23 | `GET /my/events` (ORGANIZER) shows own events in all statuses, filter by `status` | yes |
| CAT-24 | `GET /categories` equals the enum | yes |
| CAT-25 | NoSQL injection: `?category[$ne]=x`, `?q={"$where":"1"}`, JSON bodies with `$` operators, regex metacharacters in `city`/`q` | `400` or treated as literals, no behavior change, no ReDoS |

### 3.3 GraphQL (`POST /graphql`, read-only)

| ID | Check | Expected |
|---|---|---|
| CAT-30 | `events(filter,page)`, `event(id)`, `categories` with nested `Event → Venue → TicketTier` in **one** query | correct data |
| CAT-31 | Same visibility and filter rules as REST (DRAFT hidden from anonymous). Optional auth: no token = anonymous, **invalid** token = 401 envelope | yes |
| CAT-32 | Parity: GraphQL and REST return the same data for the same filter (property check over 50 random filters) | equal |
| CAT-33 | No mutations exist. No seat-availability field. Introspection **off** when `APP_ENV=production` | yes |
| CAT-34 | Depth limit (10-level nested query rejected). Alias/batch bomb (50 aliases) rejected. Query size cap. Pagination max 50 | rejected with GraphQL error `extensions.code` and `requestId` |
| CAT-35 | Errors never leak stack traces. Unknown field → standard GraphQL validation error | yes |

Sample nested query to include in the README and tests:

```graphql
query { events(filter:{city:"Vadodara"}, page:{page:1,limit:5}) {
  items { id title startsAt venue { name city } ticketTiers { tierId name priceMinor capacity } } meta { total } } }
```

### 3.4 gRPC `CatalogService.GetEventForBooking` (port 50052)

| ID | Check | Expected |
|---|---|---|
| CAT-40 | PUBLISHED event returns `event_id, title, organizer_id, status, starts_at, sale_starts_at, sale_ends_at` and every tier (`tier_id, name, price_minor (int64), currency, capacity, seat_prefix`) with correct values | exact |
| CAT-41 | Unknown id → `NOT_FOUND`. DRAFT/CANCELLED → `FAILED_PRECONDITION`. Non-UUID → `INVALID_ARGUMENT` | yes |
| CAT-42 | `x-request-id` metadata appears in logs. Deadline/cancellation honored | yes |
| CAT-43 | `buf lint` clean and `buf breaking` against `main` shows no breaking change. Stubs are generated at build, not committed | yes |
| CAT-44 | **Wire compatibility:** Booking's Java client against the real Catalog server maps every field correctly (INT-01 covers it end to end) | yes |
| CAT-45 | gRPC port not reachable from outside the cluster network (OPS/NetworkPolicy). gRPC reflection only in dev | yes |

### 3.5 MongoDB and data

| ID | Check | Expected |
|---|---|---|
| CAT-50 | Single-node **replica set** initialized (compose/Helm job). Service refuses to start change-stream features without it and says why | yes |
| CAT-51 | Indexes exist exactly as specced: unique `slug`; text on `title+description+tags`; `(status, startsAt)`; `(category, status, startsAt)`; `(organizerId, createdAt)`; optional 2dsphere | yes |
| CAT-52 | `explain` shows index use (no COLLSCAN) for the main list, category and organizer queries with 10 000 documents | IXSCAN |
| CAT-53 | Mongo user for the service has only its database's `readWrite`. No admin credentials in app config | yes |
| CAT-54 | Only the Catalog service can reach the Catalog database (negative test: another service's network/credentials cannot connect) | blocked |

### 3.6 Events: change streams → Kafka (P2)

| ID | Check | Expected |
|---|---|---|
| CAT-60 | Publish → exactly **one** `EventPublished` on `catalog.events`: AGENTS envelope, key = eventId, payload with `eventId, title, organizerId, startsAt, endsAt, venue name/city, saleStartsAt, saleEndsAt` and the **full tier list** (`tierId,name,priceMinor,currency,capacity,seatPrefix`) | matches `shared/events` schema |
| CAT-61 | Update (title) → `EventUpdated`. Cancel → `EventCancelled`. DRAFT create/edit/delete → **no** message | yes |
| CAT-62 | `eventId` deterministic (UUIDv5 of aggregateId+version+type). `aggregateVersion` strictly increasing per event | yes |
| CAT-63 | 100 publishes in quick succession → 100 `EventPublished`, none lost. Duplicates allowed but same `eventId` | yes |
| CAT-64 | Kill the service mid-stream: it resumes from the persisted **resume token**, no loss | yes |
| CAT-65 | Kafka down 60 s while publishing: API writes still succeed. After recovery all events delivered in order per event | yes |
| CAT-66 | Payload contains no PII (no email/phone) | schema-asserted |

### 3.7 Redis cache (P2)

| ID | Check | Expected |
|---|---|---|
| CAT-70 | Second `GET /events/{id}` served from cache (hit counter +1). TTL about 60 s | yes |
| CAT-71 | Update, publish, cancel, delete invalidate immediately: a public read right after a cancel returns 404, not stale data | yes |
| CAT-72 | **No cache leak:** owner reads a DRAFT, then an anonymous read of the same id → 404 (cache key includes visibility class) | yes |
| CAT-73 | Redis down → service keeps working from MongoDB, fallback metric increments, no 5xx | yes |

### 3.8 Catalog resilience, observability, performance

| ID | Check | Expected |
|---|---|---|
| CAT-80 | MongoDB down: REST `503 UPSTREAM_UNAVAILABLE`, GraphQL error code `UPSTREAM_UNAVAILABLE`, `/health/ready` 503, recovers without restart | yes |
| CAT-81 | Metrics: HTTP duration, gRPC handled count/latency, cache hits/misses, events published, change-stream lag, Mongo op latency | present and move |
| CAT-82 | Logs carry `requestId`, `eventId` where relevant. `/health/ready` checks MongoDB primary (and Kafka only if events enabled) | yes |
| CAT-83 (S) | Perf with 10 000 events: list at 200 rps p95 < 100 ms; gRPC at 500 rps p95 < 30 ms; 100 publishes/s sustained. Record numbers | report |

## 4. Booking service

**Feature checklist:** (P1) seat map, hold algorithm (Redis `SET NX PX` + MySQL conditional update), bookings API, cancel, expiry job, lazy inventory init through Catalog gRPC, Resilience4j breaker; (P2) outbox + Debezium CDC, Kafka consumers (`catalog.events`), RabbitMQ delay-queue expiry, organizer bookings list; (P3) checkout + orchestrated saga with Payment, late-payment compensation, refunds and event-cancel flows; (S) per-user hold cap.

### 4.1 Schema and migrations

| ID | Check | Expected |
|---|---|---|
| BKG-01 | Flyway migrates an empty MySQL 8 to the spec schema (tables `event_inventory, seats, bookings, booking_items, outbox_events, processed_events`; keys `uq_seat`, `uq_idem`; index `idx_event_status`; `DATETIME(3)` UTC; utf8mb4; InnoDB). Re-running is a no-op | yes |
| BKG-02 | `spring.jpa.hibernate.ddl-auto=validate` (never `update`/`create`). App starts against the migrated schema | yes |
| BKG-03 | Outbox columns match Debezium's Outbox Event Router defaults (`id, aggregatetype, aggregateid, type, payload JSON, created_at`) | yes |
| BKG-04 | Runtime DB user cannot `DROP/ALTER` (least privilege). Migrations run under a separate user or hook | yes (S) |

### 4.2 Inventory initialization

| ID | Check | Expected |
|---|---|---|
| BKG-10 | First `GET /api/v1/bookings/events/{id}/seats` calls Catalog gRPC **once**, creates `event_inventory` and exactly Σcapacity seats labeled `{seatPrefix}-{n}` (n = 1..capacity), price copied from the tier, all `AVAILABLE` | yes |
| BKG-11 | 20 parallel first requests → exactly Σcapacity seats, no duplicates, no 5xx, Catalog called at most a few times | yes |
| BKG-12 | Non-published or unknown event → `404 EVENT_NOT_FOUND` | yes |
| BKG-13 | Seat map shape per tier `{tierId,name,priceMinor,total,available,seats:[{label,status}]}`. HELD seats show as unavailable, expired holds show AVAILABLE, no holder identity exposed. Public (no token). Invalid token → 401 | yes |
| BKG-14 | Large event (50 000 seats) initializes with batched inserts, < 10 s, no OOM | yes (S) |
| BKG-15 (P2) | `EventPublished` consumer initializes eagerly and idempotently (`processed_events`): same message 5× → one inventory. Out-of-order older `aggregateVersion` ignored | yes |

### 4.3 Hold algorithm (the core guarantee)

| ID | Check | Expected |
|---|---|---|
| BKG-20 | Hold one seat | `201` `{bookingId,status:HELD,items,totalAmountMinor,currency,holdExpiresAt}`. Seat `HELD` with `held_by_booking_id`. Redis key exists with TTL about `HOLD_TTL`. `holdExpiresAt` about now + TTL (±2 s) |
| BKG-21 | Multi-seat across tiers | `totalAmountMinor` = exact sum, computed server-side |
| BKG-22 | **Atomic multi-seat:** `[A-1 free, A-2 held]` → `409 SEAT_UNAVAILABLE` listing A-2. A-1 is still AVAILABLE, no leftover Redis key | yes |
| BKG-23 | 7 seats → `400 TOO_MANY_SEATS`. 0 seats, duplicate labels in one request → `400 VALIDATION_ERROR`. Unknown label or label/tier mismatch → `404 SEAT_NOT_FOUND` | yes |
| BKG-24 | Event not on sale (cancelled, outside sale window, started) → `409 EVENT_NOT_ON_SALE` | yes |
| BKG-25 | **Race:** 50 users hold the same single seat in parallel | exactly one `201`, 49 `409`, no 5xx. DB has one HELD row, Redis one key |
| BKG-26 | **Deadlock-free:** 20 users repeatedly request random overlapping 3-seat subsets of 10 seats (200 rounds). Seat labels are sorted before updating | no deadlock errors in logs (`Deadlock found`, SQLState 40001), each seat held by ≤ 1 booking |
| BKG-27 | **Consistency audit** after any mixed workload: `SOLD + active HELD + AVAILABLE = total` per tier. Every HELD seat points to an existing active booking. Every active booking's items point back to seats it holds | audit SQL returns 0 violations |
| BKG-28 | `Idempotency-Key`: same user+key+body → same `bookingId`, one hold. Same key, different body → `409 CONFLICT`. Different user, same key → independent. 10 concurrent same-key requests → one booking | yes |
| BKG-29 | Expired hold is bookable by someone else immediately (advance the clock), even before the expiry job runs. The old booking can no longer proceed | yes |
| BKG-30 | **Redis down:** holds still work through MySQL alone and the race test (BKG-25) still has exactly one winner | yes |
| BKG-31 (S) | Crash between the Redis SET and the MySQL commit leaves an orphan key. **Record the observed behavior** (seat bookable again within `HOLD_TTL`, ideally via reconciliation) | report |
| BKG-32 | Price integrity: price comes from inventory only. A client-sent price/`userId`/`status`/`holdExpiresAt` is ignored | yes |
| BKG-33 (S) | Per-user cap on concurrent active holds (default 3) → `409 TOO_MANY_ACTIVE_HOLDS` (anti-hoarding for flash sales) | yes |

### 4.4 Bookings API

| ID | Check | Expected |
|---|---|---|
| BKG-40 | `GET /me` paginated, newest first, `status` filter, own bookings only | yes |
| BKG-41 | `GET /{id}`: owner and ADMIN → 200. Another user → `404 NOT_FOUND` (hidden). Route order: `/me` is not captured by `/{id}` | yes |
| BKG-42 | `POST /{id}/cancel` on HELD → `CANCELLED`, seats AVAILABLE again in DB **and** Redis, immediately bookable. Repeat → 200 no-op. Another user → 403. EXPIRED/FAILED → `409 INVALID_BOOKING_STATE` | yes |
| BKG-43 | Allowed transitions only: `HELD→PAYMENT_PENDING/CANCELLED/EXPIRED`, `PAYMENT_PENDING→CONFIRMED/FAILED/EXPIRED`. Every other transition rejected | yes |
| BKG-44 | `confirm-dev` exists only under the `dev` profile (404 in prod profile) and is flagged for removal before release | yes |
| BKG-45 (P2) | `GET /events/{eventId}/bookings`: the event's organizer and ADMIN only (organizer id comes from `event_inventory`, no extra Catalog call). Others 403 | yes |
| BKG-46 | `eventId` non-UUID, SQL-injection strings in `seatLabel`, 10 000-char fields → `400`, no stack trace. Parameterized queries only | yes |

### 4.5 Expiry

| ID | Check | Expected |
|---|---|---|
| BKG-50 | Scheduled job marks expired HELD bookings `EXPIRED`, frees seats in MySQL **and** Redis. Idempotent | yes |
| BKG-51 | Two app instances running the job together: no double processing, no errors (`SKIP LOCKED` or a lock) | yes |
| BKG-52 (P2) | RabbitMQ delay queue: creating a hold publishes a TTL message → DLX → `booking.hold.expired` queue → consumer expires the booking if still HELD. Fires within ±2 s of the TTL (use TTL 5 s) | yes |
| BKG-53 (P2) | RabbitMQ stopped: holds still work and expiry still happens through the scheduled job | yes |
| BKG-54 | **Expiry vs confirm race:** force the interleaving (barrier). Exactly one wins. If confirm wins, seats are `SOLD` and never released. Updates are conditional (`WHERE status IN (...)`, version column) | yes |
| BKG-55 | `BookingExpired` is emitted exactly once per expiry (P2) | yes |

### 4.6 Catalog client and resilience

Use the in-process Catalog stub with scripted behavior.

| ID | Check | Expected |
|---|---|---|
| BKG-60 | `UNAVAILABLE` retried at most twice (reads only). `NOT_FOUND` → 404, `FAILED_PRECONDITION` mapped, no retry | yes |
| BKG-61 | Timeout 2 s: stub delays 5 s → call aborted near 2 s → `503 UPSTREAM_UNAVAILABLE` | yes |
| BKG-62 | **Circuit breaker:** 10-call window, 50 % failures → OPEN. While open, calls fail fast (< 50 ms). After 10 s half-open, a success closes it. State exposed as a metric | yes |
| BKG-63 | **Fallback:** Catalog down → seat map and holds still work for already-initialized events. An uninitialized event → `503 UPSTREAM_UNAVAILABLE`. Recovery without restart | yes |
| BKG-64 | One long-lived gRPC channel (no channel per request), `x-request-id` sent, deadline set on every call | yes |

### 4.7 Payment saga (P3, with the Payment stub)

| ID | Check | Expected |
|---|---|---|
| BKG-70 | Checkout: `HELD→PAYMENT_PENDING`, Payment `CreatePayment` called once with `amount_minor = total`, `currency`, `user_id`, `booking_id`, idempotency key = bookingId. Response carries `paymentId, provider, providerOrderId, publicKey` | yes |
| BKG-71 | Repeat checkout → same payment info, **no second** `CreatePayment`. Checkout after expiry → `409 HOLD_EXPIRED`. Checkout on non-HELD → `409 INVALID_BOOKING_STATE` | yes |
| BKG-72 | Payment gRPC down → `503`, booking stays HELD and retry works later. Stub that creates the payment but the client times out: retry with the same key returns the same payment (no duplicate) | yes |
| BKG-73 | `PaymentSucceeded` → `CONFIRMED`, seats `SOLD`, Redis keys released, `BookingConfirmed` outbox row written **in the same transaction** (inject a failure at the outbox insert: the booking stays `PAYMENT_PENDING`) | yes |
| BKG-74 | `PaymentFailed` → `FAILED`, seats released, `BookingCancelled` (reason `PAYMENT_FAILED`) emitted once | yes |
| BKG-75 | Same payment event delivered 5× → one transition, one outbox row (`processed_events`) | yes |
| BKG-76 | Unknown `bookingId`, or amount/currency mismatch against the booking → not confirmed, retried then DLQ, metric raised, no crash | yes |
| BKG-77 | **Late payment:** booking already `EXPIRED` or `CANCELLED` (seats re-held by someone else), then `PaymentSucceeded` arrives → booking is **not** confirmed, seats untouched, a **refund is requested** (observable on the Payment stub or as an outbox event), `late_payments_total` +1 | yes |
| BKG-78 | Stuck `PAYMENT_PENDING` sweeper: past the payment timeout it asks Payment `GetPayment` and confirms, fails or expires accordingly | yes (S) |
| BKG-79 | `payment.events` consumer: group `booking-service`, offset committed only after the DB commit, poison messages to a DLQ topic, restart resumes, two instances never double-process | yes |
| BKG-80 | Confirmed-booking cancel and event-cancel flows: confirmed bookings go through refund (`REFUND_PENDING → REFUNDED`), seats freed, `BookingRefunded` (with `userId`, `eventTitle`) emitted. **Gap to report:** the Payment proto has no `RefundPayment` RPC yet | P3 / report |

### 4.8 Outbox and CDC (P2)

| ID | Check | Expected |
|---|---|---|
| BKG-90 | Every event-emitting state change writes its outbox row in the **same DB transaction** (failure injection before commit → neither persisted) | yes |
| BKG-91 | Outbox `payload` holds the **complete AGENTS envelope** (`eventId` = outbox id, `eventType, occurredAt, aggregateId, aggregateVersion, requestId, payload{...}`). Payloads match the contracts: `BookingConfirmed {bookingId,eventId,eventTitle,organizerId,userId,paymentId,totalAmountMinor,currency,confirmedAt}` plus optional `eventStartsAt, venueName, venueCity, items[{seatLabel,tierName,priceMinor}]`; `BookingRefunded {bookingId,eventId,organizerId,userId,eventTitle,paymentId,refundId,refundAmountMinor,currency,refundedAt}` | schema-valid |
| BKG-92 | Debezium MySQL connector (definition in `infra/debezium/`) is `RUNNING`, routes rows to topic **`booking.events`**, message key = `bookingId`, latency p95 < 2 s locally | yes |
| BKG-93 | Ordering per booking preserved (`BookingConfirmed` before `BookingRefunded`) | yes |
| BKG-94 | Kill Kafka Connect/Debezium mid-stream, then restart: no loss. Duplicates carry the same `eventId` | yes |
| BKG-95 | MySQL prerequisites documented and enabled (row binlog, server id, Debezium user grants). Outbox rows are purged after publication so the table doesn't grow forever | yes |
| BKG-96 | Events contain no PII (no email, name) | yes |

### 4.9 `catalog.events` consumers (P2)

| ID | Check | Expected |
|---|---|---|
| BKG-100 | `EventUpdated` updates only denormalized `title` in `event_inventory`. Unknown event types ignored. Malformed messages → DLQ topic, consumer continues | yes |
| BKG-101 | `EventCancelled` (P3 for the refund part): inventory `CANCELLED`, HELD bookings `CANCELLED` with seats released, new holds → `409 EVENT_NOT_ON_SALE` | yes |
| BKG-102 | Manual offset commit after DB commit, restart resumes, dedupe via `processed_events` | yes |

### 4.10 Security, resilience, observability, ops

| ID | Check | Expected |
|---|---|---|
| BKG-110 | Run the **C-07 JWT matrix** against Spring Security. Roles map from the `role` claim. Another user's booking: read → 404, mutate → 403 | yes |
| BKG-111 | Actuator exposure: only health and Prometheus, internal only. `env`, `beans`, `heapdump` and H2 console not exposed. `server.error.include-stacktrace=never`. Jackson default typing off | yes |
| BKG-112 | MySQL down: `503`, `ready` false, no partial state. Slow MySQL (Toxiproxy 3 s): Hikari timeouts fire (≤ 3 s), `503` not a hang | yes |
| BKG-113 | Redis down: degraded (see BKG-30), metric incremented, **readiness stays true** (MySQL is the only hard dependency) | yes |
| BKG-114 | Kafka or Debezium down: all business operations succeed, outbox rows accumulate then drain after recovery | yes |
| BKG-115 | `kill -9` during a hold storm: consistency audit (BKG-27) passes after restart. Orphan Redis keys expire | yes |
| BKG-116 | Graceful shutdown (`server.shutdown=graceful`): scheduler and consumers stop cleanly. Runs inside a 768 Mi container (container-aware JVM flags) without OOM | yes |
| BKG-117 | Metrics: `holds_attempted_total{result}`, hold latency, seat conflicts, bookings by status, expired holds, outbox pending, late payments, consumer lag, Resilience4j state and calls, HikariCP pool, JVM, HTTP. Logs carry `requestId, bookingId, eventId` | present |
| BKG-118 | Helm values: probes `/health/live`+`/health/ready`, resource limits, **HPA** (min 1, max ≥ 3), `securityContext`, Secrets from refs, `readOnlyRootFilesystem` with `/tmp` emptyDir, NetworkPolicy allowing only the gateway in and only MySQL/Redis/Kafka/RabbitMQ/Catalog/Payment out | yes |

### 4.11 Booking performance (record numbers; this is the headline result for the report)

| ID | Load | Target |
|---|---|---|
| BKG-120 | 500 rps on **one** seat for 30 s | exactly 1 winner, 5xx = 0, conflict p95 < 100 ms |
| BKG-121 | **Flash sale:** 1000 virtual users, 200 seats, random seat picks, 60 s | **zero oversell** (sold + held ≤ 200, audit clean), 5xx = 0. Record throughput and p50/p95/p99 |
| BKG-122 | Seat map reads at 300 rps | p95 < 100 ms |
| BKG-123 | 50 000-seat init | < 10 s |
| BKG-124 (P3, k8s) | Same flash sale on Kubernetes with the HPA on: scales out from 1 to ≥ 3 pods under load, **still zero oversell**. A rolling update during load gives zero 5xx | yes |

Fail a performance check only for errors, oversell, or more than 5× the target. Otherwise report the numbers and fix cheap root causes.

## 5. Cross-service integration (put in `tests/e2e/`, run through the gateway on `localhost:8080`)

| ID | Scenario | Expected |
|---|---|---|
| INT-01 | **Contract:** compile `shared/proto` in both languages. Java client against the real Python Catalog server: all fields map (price, capacity, seat prefix, timestamps) | pass |
| INT-02 | **Full journey** (below) | numbers match |
| INT-03 (P2) | Organizer publishes → inventory exists within 5 s **without** any seat-map request | yes |
| INT-04 (P3) | Organizer cancels an event with 2 confirmed + 1 held booking: hold released, confirmed bookings refunded, `BookingRefunded` reaches Ledger (balance drops) and Notification (refund mail) | yes |
| INT-05 | Catalog stopped: seat map and holds for initialized events continue, uninitialized event `503`, gateway breaker opens, recovery needs no restart | yes |
| INT-06 (P3) | Payment stopped: checkout `503`, booking stays HELD, recovers | yes |
| INT-07 (P2) | Kafka stopped 2 min during bookings: bookings still succeed. After recovery Ledger and Notification each act **exactly once** per event | yes |
| INT-08 (P2) | Restart Debezium mid-run: no loss, no double effect downstream | yes |
| INT-09 | **Cross-service audit script:** every `CONFIRMED` booking has exactly one Ledger sale of the same amount and one `PAID` payment. No seat `SOLD` without a `CONFIRMED` booking. Σ(SOLD seat prices) = Ledger gross for the event minus refunds | 0 violations |
| INT-10 | Duplicate Kafka delivery of every event (replay the topic): no double confirmation, no double Ledger sale, no second email | yes |
| INT-11 | RBAC matrix through the gateway across all Catalog and Booking routes (anonymous / ATTENDEE / ORGANIZER / ADMIN, own vs other's resource) | matches spec |
| INT-12 | One `X-Request-Id` visible in gateway, Catalog and Booking logs, outbox envelope `requestId`, and Ledger event metadata | yes |
| INT-13 (S) | One distributed trace spans gateway → Booking → Catalog/Payment in Jaeger | yes |
| INT-14 (S) | If Consul is in place: services register and show healthy, a stopped service turns critical or deregisters within the check interval, gateway resolves upstreams through Consul | yes |
| INT-15 (P3, k8s) | In kind/k3s: all pods Ready, multi-container pods present (log sidecar, init containers ran), HPA scales Booking, **NetworkPolicy** blocks Catalog→MySQL, Booking→MongoDB and any external access to gRPC `50052` | yes |
| INT-16 | CI pipeline runs build, tests, gitleaks, Semgrep, Trivy, hadolint and fails on HIGH | yes |

**INT-02 full journey (exact numbers):** register organizer O, attendee A, use seeded ADMIN → O creates an event with one tier `A` (`priceMinor 100000`, capacity 100, prefix `A`), publishes → A finds it by `GET /catalog/events?q=...` and by GraphQL → seat map shows `A: total 100, available 100` → A holds `A-1, A-2, A-3` (total `300000`) → A checkouts → payment succeeds (signed test webhook) → booking `CONFIRMED`, seats `SOLD` → Ledger: organizer available = `285000` (5 % fee = 15000), platform fee 15000 → Notification: confirmation email logged with the right amount, seats and time → A cancels nothing, a second attendee cannot hold `A-1` (`409 SEAT_UNAVAILABLE`) → cross-service audit (INT-09) is clean.

## 6. Assignment coverage matrix (what to prove, and the evidence to collect)

| Req | What must be demonstrably true | Evidence to capture |
|---|---|---|
| 1. Different language per service | Catalog = Python (FastAPI), Booking = Java (Spring Boot). Each builds in its own container and CI job. (Whole project: TypeScript, Python, Java, C#, PHP) | repo tree, Dockerfiles, CI run, language table in the report |
| 2. Database per service, different products | Catalog = MongoDB (replica set), Booking = MySQL (+ its own Redis). Separate instances, credentials and volumes. No cross-service DB access (CAT-54, INT-15) | compose/Helm manifests, NetworkPolicy deny output, schema/collection diagrams |
| 3a. Discovery service | Consul registration and gateway resolution (INT-14) plus a short comparison with Kubernetes DNS | Consul UI screenshot |
| 3b. Circuit breaker | Resilience4j in Booking → Catalog and Booking → Payment (BKG-62); `opossum` in the gateway (GW) | state-transition metric graph, breaker log lines |
| 3c. API gateway | All Catalog and Booking routes only through the gateway, with auth modes, roles, rate limit (INT-11) | route table, curl transcripts |
| 3d. Monitoring and logging | Prometheus + Grafana dashboards (holds, conflicts, breaker state, lag), JSON logs in Loki, traces in Jaeger, shared `requestId` (INT-12/13) | dashboard screenshots |
| 4. Sync + async | REST (public API), **gRPC** (Booking → Catalog, Booking → Payment), **GraphQL** (Catalog reads); **Kafka** (`catalog.events`, `booking.events`, `payment.events`), **RabbitMQ** (hold-expiry delay queue, notification jobs) | Kafka topic listing and sample messages, RabbitMQ UI showing the DLX, `grpcurl` output, GraphQL query |
| 5. Kubernetes | Pods and cluster, **multi-container pods** (app + log sidecar, init containers), probes, ConfigMaps/Secrets, ingress with TLS, HPA, StatefulSets for databases (INT-15, BKG-124) | `kubectl get pods` showing `2/2`, HPA events, rollout log |
| 6. Security | RS256 JWT + JWKS, RBAC, no trust in client identity, TLS at ingress, NetworkPolicies, Kubernetes Secrets, hardened containers, DevSecOps pipeline (gitleaks, Semgrep, Trivy, hadolint, dependency audit), injection tests | scan reports, JWT attack test results |
| 7. ACID/BASE, CDC, saga | **ACID:** Booking's atomic multi-seat hold (BKG-22/25/26/27). **BASE:** Catalog eventually-consistent downstream copies, Redis soft state, Ledger read models. **Transactional outbox + CDC:** Booking → Debezium → Kafka (BKG-90..95); Catalog change streams. **Saga with compensation:** hold → pay → confirm / release / late-payment refund (BKG-77). **Idempotent consumers** everywhere. **CQRS + event sourcing:** Ledger | the flash-sale zero-oversell report, outbox row → Kafka message trace, saga diagram, rebuild demo |

**Evidence pack (collect into `docs/evidence/`):** test summary per group, k6 flash-sale report (users, throughput, p95/p99, zero oversell), Grafana and Jaeger screenshots, Kafka/RabbitMQ/Debezium/Consul UI screenshots, `kubectl` outputs, NetworkPolicy deny proof, scan reports, the INT-09 audit output.

## 7. Viva demo script (rehearse it; each step must work)

1. `kubectl get pods` → every pod `Ready`, the `2/2` multi-container ones.
2. Organizer publishes an event → show the `EventPublished` message in Kafka.
3. GraphQL nested query from a browser or Postman.
4. 50 users fight for one seat (k6) → **exactly one winner** → show the audit query.
5. Pay for a booking → show `PaymentSucceeded`, the outbox row, the Debezium message, the Ledger balance and the email.
6. Kill Catalog → bookings for initialized events still work → show the circuit-breaker state in Grafana → restart Catalog, it recovers.
7. Let a hold expire → seat becomes bookable again (RabbitMQ delay queue in the UI).
8. Late payment after expiry → show the refund compensation.
9. Flush the Ledger's Redis → rebuild → identical numbers.
10. Show the CI run with gitleaks, Semgrep, Trivy and the HPA scaling under load.

## 8. Final report (required)

1. Summary: pass/fail/NOT_IMPLEMENTED/N-A counts per group, with the exact commands used.
2. Matrix: `ID | status | notes`.
3. Feature checklist results (PRESENT/MISSING) for Catalog and Booking.
4. Fixes made (files and root causes).
5. Measured numbers: perf results, observed orphan-Redis-key behavior (BKG-31), Debezium latency, breaker timings.
6. Assignment coverage table (§6) with each row marked PROVEN / PARTIAL / MISSING and the evidence file.
7. Open issues: gaps owned by others (gateway routes, `RefundPayment` RPC, shared schemas), DECISIONS, questions for the human.

**Done =** all MUST checks for implemented phases pass in one clean full run, every unimplemented feature is listed explicitly, the evidence pack exists, and no secrets or unrelated changes are in the diff.

## 9. Decisions encoded in this spec (the human may veto)

1. New domain codes: `SEAT_NOT_FOUND` (404), `INVALID_EVENT_STATE`, `EVENT_FIELD_LOCKED`, `INVALID_BOOKING_STATE` (409), `TOO_MANY_ACTIVE_HOLDS` (S).
2. `seatPrefix` must be unique per event and match `^[A-Z]{1,4}$`.
3. Public lists use the lowest tier price (`fromPriceMinor`) for price filters and sorting.
4. Another user's booking is hidden (404); mutating it is 403.
5. The outbox `payload` column contains the full AGENTS envelope. Debezium routes it to `booking.events` keyed by `bookingId`.
6. Catalog event IDs are deterministic (UUIDv5). Catalog may publish duplicates, never lose events.
7. Redis is an optimization only: holds work without it, and readiness depends on MySQL alone.
8. Checkout does not extend the hold. Late payment after expiry triggers a refund compensation.
9. Booking needs a `RefundPayment` RPC (or an equivalent event) from Payment. It doesn't exist yet in the proto.
10. Expiry has two mechanisms: scheduled job (always on) and RabbitMQ delay queue (P2).
11. The per-user active-hold cap (3) is optional.
12. The assumed `payment.events` payloads in §1.
