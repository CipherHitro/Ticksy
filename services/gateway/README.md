# Ticksy API Gateway Service

The **API Gateway** is the single public entry point for all client traffic across the Ticksy microservices platform. It handles routing, SSL termination / reverse proxying, JWT authentication, coarse authorization checks, CORS, rate limiting, request tracing, timeouts, and upstream circuit breaking.

## 🚀 Responsibilities
- **Single Public Port:** Binds to `PORT 8080` (all clients speak only to this gateway).
- **Security & Headers:**
  - Strict `helmet` defaults & CORS with configurable origins (`CORS_ORIGINS`).
  - Request ID tracking (`X-Request-Id` generated or propagated, echoed in every response).
  - Client header stripping (`X-User-*`, `X-Forwarded-*`) to prevent spoofing.
  - Injects canonical `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Request-Id`.
- **JWT Authentication & Coarse Authorization:**
  - Validates tokens using RS256 JWKS public keys from Auth service (`jose` with key caching and rotation).
  - Routes specify `authMode`: `public`, `optional`, or `required`.
  - Enforces route-level role constraints (e.g. `ORGANIZER`, `ADMIN`).
- **Resilient Reverse Proxy:**
  - High-performance proxying using `undici.request()`.
  - Raw body streaming (`express.raw`) preserving raw binary/JSON buffers (preserves Stripe webhooks & hashing).
  - Circuit breaking per upstream using `opossum`:
    - 50% failure rate over min 10 requests trips breaker.
    - 10-second cool-down window before half-open probe.
    - Upstream 5xx and timeouts count as breaker failures; 4xx responses do not.
  - Preserves `Cookie` request headers and `Set-Cookie` response headers for session rotation.
  - Safe retry on connection errors for idempotent `GET`/`HEAD` calls only.
- **Observability & Diagnostics:**
  - Structured JSON logging with `pino` and `pino-http`.
  - Health checks: `/health/live`, `/health/ready`, and `/health/upstreams` (live circuit breaker states).

---

## 🛠️ Tech Stack
- **Runtime:** Node.js 22 LTS (ESM, TypeScript, `NodeNext`)
- **HTTP Framework:** Express 5
- **Reverse Proxy:** `undici`
- **Circuit Breaker:** `opossum`
- **JWT Verification:** `jose`
- **Validation:** `zod`
- **Rate Limiting:** `express-rate-limit`
- **Security:** `helmet`, `cors`
- **Logging:** `pino`, `pino-http`
- **Testing:** `vitest`, `supertest`

---

## 📋 Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Listening HTTP port | `8080` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |
| `LOG_LEVEL` | Pino log level | `info` |
| `AUTH_URL` | Upstream Auth service URL | `http://localhost:4001` |
| `CATALOG_URL` | Upstream Catalog service URL | `http://localhost:4002` |
| `BOOKING_URL` | Upstream Booking service URL | `http://localhost:4003` |
| `AUTH_JWKS_URL` | Auth Service JWKS public key endpoint | `http://localhost:4001/.well-known/jwks.json` |
| `JWT_ISSUER` | Expected JWT issuer claim (`iss`) | `ticksy-auth` |
| `JWT_AUDIENCE` | Expected JWT audience claim (`aud`) | `ticksy-api` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000,http://localhost:5173` |
| `RATE_LIMIT_WINDOW_MS` | Rate limiting sliding window (ms) | `60000` (1 min) |
| `RATE_LIMIT_MAX` | Max requests per IP per window | `100` |
| `UPSTREAM_TIMEOUT_MS` | Proxy forward timeout (ms) | `10000` (10s) |

---

## 🚦 Route Table & Rules

Configured declaratively in `src/config/routes.ts`:

| Method | Path Pattern | Upstream | Auth Mode | Roles | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/(register\|login)` | `auth` | `public` | None | Client registration & credentials |
| `POST` | `/api/v1/auth/(refresh\|logout)` | `auth` | `public` | None | Refresh token cookie rotation |
| `GET` | `/api/v1/auth/me` | `auth` | `required` | Any | Profile of authenticated user |
| `GET` | `/api/v1/catalog/**` | `catalog` | `optional` | None | Anonymous or personalized browsing |
| `POST/PUT/PATCH/DELETE` | `/api/v1/catalog/**` | `catalog` | `required` | `ORGANIZER`, `ADMIN` | Event creation & updates |
| `POST` | `/graphql` | `catalog` | `optional` | None | Catalog GraphQL API |
| `GET` | `/api/v1/bookings/events/:id/seats` | `booking` | `optional` | None | Public seat map check (prioritized) |
| `ANY` | `/api/v1/bookings/**` | `booking` | `required` | Any | Booking creation, payment, holds |

---

## 🏃 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Run Locally (Development)
```bash
npm run dev
```

### 4. Run Tests & Typecheck
```bash
npm test
npm run typecheck
npm run build
```

### 5. Run with Docker
```bash
docker compose -f ../../infra/docker-compose.yml up gateway -d
```
