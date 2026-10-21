# Ticksy Booking Service (Java 21 / Spring Boot 3)

The **Booking Service** manages seat inventory per event, enforces time-limited seat holds, coordinates distributed saga states, and manages the booking lifecycle. It is the concurrency centerpiece of the Ticksy platform.

---

## 🚀 Architecture & Key Features

- **Stack**: Java 21+ LTS, Spring Boot 3.3.5, Spring Data JPA, Flyway, MySQL 8, Spring Data Redis, Spring Security OAuth2 Resource Server, Resilience4j, gRPC client, Micrometer, Prometheus.
- **Race-Safe Concurrency & Deadlock Freedom**:
  - **MySQL as Source of Truth**: Single atomic conditional update using InnoDB row-level locks:
    ```sql
    UPDATE seats
    SET status='HELD', held_by_booking_id=?, held_until=?, version=version+1
    WHERE event_id=? AND tier_id=? AND seat_label=?
      AND (status='AVAILABLE' OR (status='HELD' AND held_until < NOW(3)));
    ```
  - **Deterministic Row Locking**: All requested seat labels are sorted prior to update, eliminating deadlocks on overlapping concurrent multi-seat requests.
  - **Redis Fast Front Door**: Low-cost `SET hold:{eventId}:{seat} {bookingId} NX PX {ttl}` front door that rejects contention cheaply during flash sales. Compare-and-delete Lua script ensures only matching holders release keys.
- **Hold Expiry & Self-Healing**:
  - `@Scheduled` job runs every 30 seconds to transition expired `HELD` bookings to `EXPIRED` and free seats.
  - The conditional hold query treats expired holds as available immediately, guaranteeing correctness without waiting for the background sweeper.
- **Lazy Inventory Initialization**:
  - On the first seat map request for an uncached event, Booking lazily calls Catalog over gRPC (`GetEventForBooking`), generating one seat per unit of capacity with tier pricing and filling `event_inventory`.
- **Circuit Breaker & Resilience**:
  - Resilience4j Circuit Breaker and Retry around Catalog gRPC client: 10-call window, 50% failure rate, 10s wait in open state, 2s timeout. Cached events continue serving if Catalog is temporarily down.
- **Transactional Outbox (Debezium / Kafka ready)**:
  - Writes `BookingConfirmed`, `BookingCancelled`, and `BookingExpired` events into the `outbox_events` table in the exact same database transaction as the state transition.
- **Security & JWT Verification**:
  - RS256 token verification using public keys from Auth's JWKS endpoint (`/.well-known/jwks.json`).
  - Caller identity is strictly taken from the verified JWT `sub` UUID claim.
  - Role claim mapped to `ROLE_ATTENDEE`, `ROLE_ORGANIZER`, `ROLE_ADMIN`.

---

## 📋 Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Listening HTTP port | `4003` |
| `MYSQL_HOST` | MySQL database host | `localhost` |
| `MYSQL_PORT` | MySQL database port | `3307` |
| `MYSQL_DATABASE` | MySQL database name | `booking_db` |
| `MYSQL_USER` | MySQL username | `booking_user` |
| `MYSQL_PASSWORD` | MySQL password | `booking_pass` |
| `MYSQL_URL` | Full JDBC connection string | `jdbc:mysql://localhost:3307/booking_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC` |
| `REDIS_HOST` | Redis cache host | `localhost` |
| `REDIS_PORT` | Redis cache port | `6380` |
| `AUTH_JWKS_URL` | Auth Service JWKS public keys | `http://localhost:4001/.well-known/jwks.json` |
| `JWT_ISSUER` | Expected JWT issuer (`iss`) | `ticksy-auth` |
| `JWT_AUDIENCE` | Expected JWT audience (`aud`) | `ticksy-api` |
| `CATALOG_GRPC_TARGET` | Catalog gRPC host and port | `localhost:50052` |
| `HOLD_TTL_SECONDS` | Hold validity in seconds | `600` (10 minutes) |
| `MAX_SEATS_PER_BOOKING` | Maximum seats per single booking | `6` |
| `EXPIRY_CHECK_INTERVAL_MS` | Expiration sweeper interval | `30000` (30 seconds) |

---

## 📡 REST Endpoints (`/api/v1/bookings`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/events/{eventId}/seats` | Public | Returns per-tier seat map: `{tierId, name, total, available, seats:[{label, status}]}`. HELD seats display as unavailable. |
| `POST` | `/` | Authenticated | Holds seats: `{eventId, seats:[{tierId, seatLabel}]}` + optional `Idempotency-Key` header. Returns `201 Created` with hold expiration. |
| `GET` | `/me` | Authenticated | Paginated history of authenticated user's bookings with optional `?status=HELD` filter. |
| `GET` | `/{id}` | Owner or `ADMIN` | Retrieve single booking details and items. |
| `POST` | `/{id}/cancel` | Owner | Transitions `HELD` → `CANCELLED` and immediately frees held seats in MySQL and Redis. |
| `POST` | `/{id}/checkout` | Owner | Transitions `HELD` → `PAYMENT_PENDING` before proceeding to payment capture. |
| `POST` | `/{id}/confirm-dev` | Owner | *Dev Profile Only*: Transitions to `CONFIRMED`, marks seats `SOLD`, and writes `BookingConfirmed` outbox event. |
| `GET` | `/events/{eventId}/bookings` | Organizer / `ADMIN` | Retrieve all bookings for an event (requires organizer ownership). |

### Health Probes & Metrics
- `GET /health/live`: Process liveness probe (`{"status": "UP"}`).
- `GET /health/ready`: Database and Redis readiness probe.
- `GET /actuator/prometheus`: Prometheus performance metrics.

---

## 🏃 Running Locally

### 1. Start Infrastructure (MySQL & Redis)
```bash
docker compose -f infra/docker-compose.yml up -d booking-db booking-redis
```

### 2. Run the Service with Maven
```bash
cd services/booking
mvn spring-boot:run
```

### 3. Run Tests
```bash
mvn test
```
The test suite verifies:
1. 50 parallel hold requests for the exact same seat: exactly 1 succeeds, 49 fail with `409 SEAT_UNAVAILABLE`.
2. Expired holds become bookable again.
3. Overlapping multi-seat requests lock deterministically with zero deadlocks.
4. Circuit breaker fallback gracefully serves cached events when Catalog is unavailable.
