# AGENTS.md — Ticksy

> Read this whole file before writing or changing anything. It applies to every team member and every AI agent working in this repo.
> If this file and your own preference disagree, **this file wins**.
> If this file is silent or ambiguous on something, **ask the human. Do not invent a convention.**

---

## 1. What we are building

**Ticksy** is a live event ticketing platform (think BookMyShow, but for any event: concerts, meetups, conferences, workshops).
It is a polyglot microservices system built for the course *Microservice Programming and Architecture*, and it doubles as a portfolio project.

**Users**
- **ATTENDEE**: browses events, holds seats, pays, receives tickets, requests refunds.
- **ORGANIZER**: creates and publishes events, sets ticket tiers and pricing, tracks sales and payouts.
- **ADMIN**: oversees the platform. Admins cannot self-register.

**Core flow:** browse events (Catalog) → pick seats and hold them (Booking) → pay (Payment) → booking confirmed → ticket email (Notification) and organizer earnings recorded (Ledger).

**Course requirements this project must demonstrate:** a different language per service (max five distinct languages), a different database product per service, service discovery, circuit breaker, API gateway, monitoring and logging, sync (REST, gRPC, GraphQL) and async (Kafka, RabbitMQ) communication, ACID/BASE, transactional outbox with CDC, CQRS, security provisions, and Kubernetes deployment with multi-container pods.

---

## 2. Rules for agents (read first)

1. **Stay in your lane.** Only edit files inside the service folder you were asked to work on. Never edit another service's folder. If you need a change there, tell the human so they can raise it with the owner.
2. **Shared contracts need both owners.** `shared/`, `infra/docker/`, and this file are shared. Do not change them unless the task explicitly says so, and flag the change clearly in the PR.
3. **Read the spec first.** Before building a service feature, read `docs/specs/<service>.md`. Build what the spec says. If the spec is unclear or wrong, stop and ask. Do not quietly deviate.
4. **Do not invent shapes.** Response envelopes, error codes, JWT claims, header names, env var names, and event shapes are defined here or in `shared/`. Reuse them exactly.
5. **Never weaken security to make something work.** Do not disable token verification, skip signature checks, widen CORS, or hardcode secrets, even temporarily, even in tests (see §6.8).
6. **No secrets in git.** Never commit `.env`, private keys, tokens, or real credentials. Update `.env.example` when you add an env var.
7. **No cross-service database access.** A service only touches its own datastore (§9).
8. **Minimal, reviewable changes.** One concern per PR. Do not reformat files you are not changing. Do not add dependencies without mentioning them in the PR description.
9. **Finish properly.** Run the service's lint, typecheck and tests before declaring done (§14). Update the service README and `.env.example` if behavior or config changed.
10. **Do not guess about versions.** For framework, library, or tool versions and APIs that change often, check the current official docs rather than relying on memory.

---

## 3. Repository layout and ownership

```
Ticksy/
├── AGENTS.md                      # this file (single source of truth for conventions)
├── README.md
├── CLAUDE.md                      # one line: "@AGENTS.md" (for Claude Code)
├── .github/
│   └── CODEOWNERS                 # maps each services/* folder to its owner
├── docs/
│   └── specs/                     # per-service contracts: auth.md, gateway.md, catalog.md, booking.md ...
├── services/
│   ├── auth/                      # TypeScript   (owner: CipherHitro)
│   ├── gateway/                   # TypeScript   (owner: CipherHitro)
│   ├── catalog/                   # Python       (owner: yashviPayal)
│   ├── booking/                   # Java         (owner: yashviPayal)
│   ├── payment/                   # C#           (planned)
│   ├── ledger/                    # C#           (planned)
│   ├── notification/              # PHP          (planned)
│   └── support-rag/               # Python       (planned, optional)
├── shared/
│   ├── proto/                     # .proto files: the only source of truth for gRPC
│   │   └── catalog/v1/catalog.proto
│   └── events/                    # JSON Schemas for Kafka events (when messaging starts)
├── infra/
│   ├── docker/
│   │   ├── docker-compose.infra.yml   # databases, redis, brokers (uses profiles)
│   │   ├── docker-compose.apps.yml    # the services themselves (full-stack testing)
│   │   └── .env.example
│   ├── observability/             # prometheus, grafana, loki, otel configs (later)
│   ├── debezium/                  # connector definitions (later)
│   └── k8s/                       # manifests/helm (later)
└── load-tests/                    # k6 scripts
```

**Every service folder must contain:** `Dockerfile`, `.dockerignore`, `.env.example`, `README.md` (how to run, env vars, routes), and its own tests. Nothing else is shared between service folders.

---

## 4. Services at a glance

| Service | Stack | System-of-record DB | Port(s) | Public path prefix | Status |
|---|---|---|---|---|---|
| gateway | TypeScript, Express | none (Redis for rate limits) | 8080 | (entry point) | in progress |
| auth | TypeScript, Express, Prisma | PostgreSQL | 4001 | `/api/v1/auth` | running, needs RS256 migration |
| catalog | Python 3.12, FastAPI, Strawberry GraphQL | MongoDB | 4002, gRPC 50052 | `/api/v1/catalog`, `/graphql` | in progress |
| booking | Java 21, Spring Boot | MySQL (+ Redis for holds) | 4003 | `/api/v1/bookings` | in progress |
| payment | C# (.NET 8) | SQL Server | planned | `/api/v1/payments` | planned |
| ledger | C# (.NET 8) | KurrentDB (event store) + Redis read model | planned | `/api/v1/ledger` | planned |
| notification | PHP (Laravel) | Redis | planned | none (event-driven) | planned |
| support-rag | Python, FastAPI | Qdrant | planned | `/api/v1/support` | optional |

Each service owns exactly one URL prefix. Nobody serves routes under another service's prefix.

---

## 5. API conventions (all HTTP services)

### 5.1 URLs and versioning
- Every route lives under `/api/v1/<service-prefix>/...` (see §4). Exceptions: `/graphql` (catalog), `/.well-known/jwks.json` (auth, internal only), `/health/*` and `/metrics`.
- Paths use lowercase kebab-case and plural nouns: `/api/v1/bookings/me`, not `/getMyBookings`.
- The gateway forwards the path **unchanged**. Services must serve the full prefixed path themselves (no stripping or rewriting).
- Within `v1`, only additive changes (new optional fields, new routes). A breaking change means `/api/v2`.
- **Adding a public route requires adding it to the gateway route table** (`services/gateway/src/config/routes.ts`), and the gateway owner reviews that change.

### 5.2 JSON, types, and formats
| Topic | Rule |
|---|---|
| JSON field names | `camelCase` (Python: use Pydantic aliases; DB columns stay `snake_case` internally) |
| IDs | UUID v4 strings |
| Timestamps | ISO-8601 UTC with `Z`, e.g. `2026-11-01T18:30:00Z` |
| Money | Integer **minor units** (paise) plus `currency` (default `INR`). **Never floats.** Field names end in `Minor`, e.g. `priceMinor` |
| Enum-like values | `UPPER_SNAKE_CASE` (`PUBLISHED`, `ATTENDEE`). Exception: catalog category slugs are lowercase (`music`, `tech`) |
| Nulls | Return `null` explicitly for known-but-empty fields; omit only truly optional fields |

### 5.3 Success response
```json
{ "success": true, "data": { } }
```
List endpoints add pagination metadata:
```json
{ "success": true, "data": [ ], "meta": { "page": 1, "limit": 20, "total": 134 } }
```
Create returns `201`, delete with no body returns `204`, everything else `200`.

### 5.4 Error response (the only error shape)
```json
{ "success": false, "code": "SEAT_UNAVAILABLE", "message": "Seat V-12 is no longer available", "requestId": "0b6c..." }
```
- Validation errors may add `"details": [{ "field": "email", "message": "must be a valid email" }]`.
- `message` is human-readable and safe to show. **Never leak** stack traces, SQL, file paths, or internal hostnames. Unexpected errors return `500 INTERNAL_ERROR` with a generic message; log the detail server-side.
- **Every** error path must use this shape, including framework-generated ones: unknown routes (404), malformed JSON (400), auth failures from the security layer (401/403), and validation failures. Common misses: FastAPI's default 422 body and Spring Security's default 401/403 pages. Override them.

### 5.5 Status codes and error codes
| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid input. **Use 400, not 422.** |
| 401 | `UNAUTHENTICATED` | Token missing, malformed, expired, or invalid |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password at login |
| 403 | `FORBIDDEN` | Authenticated but not allowed (wrong role or not the owner) |
| 404 | `NOT_FOUND` | Resource does not exist, or is hidden from this caller |
| 409 | `CONFLICT` | State conflict (e.g. `EMAIL_TAKEN`, `SEAT_UNAVAILABLE`, `HOLD_EXPIRED` use their own code) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 / 503 / 504 | `BAD_GATEWAY` / `UPSTREAM_UNAVAILABLE` / `UPSTREAM_TIMEOUT` | Gateway or dependency failures |

Rules:
- Domain-specific codes are `UPPER_SNAKE_CASE`, documented in the owning service's spec, and never reused with a different meaning.
- Ownership: reading a resource you are not allowed to see returns `404` when the resource is hidden (e.g. someone else's DRAFT event); modifying someone else's resource returns `403`.

### 5.6 Pagination, filtering, sorting
`?page=1&limit=20` (1-based, default limit 20, **max 50**). Sorting: `?sort=startsAt` or `?sort=-startsAt` for descending. Filters are plain query params in `camelCase`.

### 5.7 Request IDs and idempotency
- Every request carries `X-Request-Id`. The gateway generates one if absent. Every service reads it, **echoes it in the response header**, includes it in all logs and error bodies, and forwards it on every outbound call (HTTP header, gRPC metadata `x-request-id`, event field `requestId`).
- State-changing POSTs that must not be duplicated (create booking, create payment) accept an `Idempotency-Key` header. A repeat with the same key and user returns the original result instead of creating a second one.

---

## 6. Authentication and credentials (non-negotiable)

This section exists so that no service invents its own auth. **Every service authenticates callers exactly this way.**

### 6.1 The one rule
> **The access token is a JWT sent in the `Authorization: Bearer <token>` header. Nothing else.**
> Not a cookie. Not a query string. Not a custom header. Not a field in the body.

### 6.2 Who owns what
| Item | Owner and behavior |
|---|---|
| Issuing and signing tokens | **Auth service only**, using its RSA **private key** |
| Verifying tokens | **Every service** (gateway included), using Auth's **public** keys from JWKS |
| Refresh tokens | **Auth service only** issues, stores (hashed), rotates and reads them |
| Cookies | Only the refresh-token cookie exists, only Auth sets or reads it. **No other service ever reads or sets cookies.** |

### 6.3 Access token
- Algorithm **RS256**. Header includes `kid`. Verify with an **explicit algorithm allowlist** (`RS256` only). Never accept `none` or HS*.
- TTL **15 minutes**.
- Claims:

| Claim | Meaning |
|---|---|
| `sub` | user ID (UUID). **The only source of caller identity.** |
| `email`, `name` | user details (for display and denormalization) |
| `role` | `ATTENDEE`, `ORGANIZER`, or `ADMIN` |
| `iss` | `ticksy-auth` (env `JWT_ISSUER`) |
| `aud` | `ticksy-api` (env `JWT_AUDIENCE`) |
| `iat`, `exp` | issued-at / expiry |

### 6.4 Verification checklist (every service)
1. Read the `Authorization` header; require the `Bearer ` prefix.
2. Verify signature using the JWKS from `AUTH_JWKS_URL`, with the `RS256` allowlist.
3. Verify `iss`, `aud`, and `exp` (clock skew tolerance max 30 seconds).
4. On any failure, respond `401 UNAUTHENTICATED` in the standard error shape.
5. Attach `{ userId: sub, email, name, role }` to the request context.
6. Check role/ownership (§6.6) and respond `403 FORBIDDEN` if not allowed.

Use the library's JWKS support instead of hand-rolling: `jose` (`createRemoteJWKSet`) for Node/TS, `PyJWT` (`PyJWKClient`) for Python, Spring Security OAuth2 Resource Server (`jwk-set-uri`) for Java, `Microsoft.IdentityModel` for .NET, `firebase/php-jwt` for PHP. Cache keys (at least 5 minutes); on an unknown `kid`, refetch at most once per minute.

### 6.5 Refresh token and cookie (Auth service only)
- Opaque random value (32 bytes, base64url). Stored in the database as a **SHA-256 hash**, never raw.
- Delivered as an `httpOnly` cookie named `refreshToken`, `SameSite=Strict`, `Secure` in production, `Path=/api/v1/auth`, lifetime 30 days.
- Used **only** by `POST /api/v1/auth/refresh` and `POST /api/v1/auth/logout`. Each refresh **rotates** the token. Reusing a revoked token revokes all of that user's sessions.
- The gateway passes `Cookie` / `Set-Cookie` through for `/api/v1/auth/*` and nothing else.
- Clients keep the access token **in memory** and send it in the `Authorization` header. When a request gets `401`, the client calls `/refresh` once and retries.
- Access tokens cannot be revoked before they expire (15 minutes). This is an accepted trade-off.

### 6.6 Authorization (defense in depth)
- The **gateway** does coarse checks (is a token required here, is the role allowed for this route).
- **Every service re-verifies the token and enforces its own rules** (roles and ownership, e.g. "only the organizer who created this event"). Never rely on the gateway alone.
- Identity always comes from the verified token's `sub`. **Never** from the request body, query string, or any `X-User-*` header. The gateway strips client-supplied `X-User-*` and `X-Forwarded-*` headers.
- Roles: `ATTENDEE` (default), `ORGANIZER`, `ADMIN`. Public registration may only create `ATTENDEE` or `ORGANIZER`.

### 6.7 Passwords and sensitive data
- Passwords hashed with bcrypt (cost 12). Never stored or logged in plaintext.
- **Never log** tokens, refresh tokens, passwords, authorization headers, card data, or full PII.
- Validate and sanitize all input. Use parameterized queries only.

### 6.8 Testing with auth
Tests that need a token must mint one with a **test RSA key pair** and point the service at a **test/mocked JWKS**. Never add a "skip auth" flag or bypass middleware to make tests pass. The only permitted dev-only shortcut is an endpoint explicitly named in a service spec (e.g. booking's `confirm-dev`), enabled only under a `dev` profile and removed before release.

### 6.9 Keys and secrets
- Dev keys are generated locally into `services/auth/keys/` (git-ignored):
  ```bash
  mkdir -p keys
  openssl genrsa -out keys/private.pem 2048
  openssl rsa -in keys/private.pem -pubout -out keys/public.pem
  ```
- Only Auth ever has the private key. Other services receive **only** `AUTH_JWKS_URL`.
- Auth exposes `GET /.well-known/jwks.json` (public, `Cache-Control: public, max-age=300`). It is for service-to-service use and is not routed through the public gateway.

---

## 7. Service-to-service communication

| Need | Use | Notes |
|---|---|---|
| Client ↔ platform | REST via gateway; GraphQL for catalog reads | Public |
| Internal request/response needing an immediate answer | **gRPC** | Contracts in `shared/proto/` |
| "Something happened" (facts, many consumers) | **Kafka** events | See §8 |
| Commands, retries, timers | **RabbitMQ** | See §8 |

**gRPC rules**
- `.proto` files live **only** in `shared/proto/<service>/v1/`, package `ticksy.<service>.v1`.
- Changes are additive: never renumber or reuse field numbers. Proto changes need approval from **both** the server owner and the client owner.
- Generated stubs are **not committed**; each service generates them at build time.
- gRPC ports are internal only, never exposed through the gateway or ingress.
- Propagate `x-request-id` as gRPC metadata. Use standard status codes (`NOT_FOUND`, `FAILED_PRECONDITION`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`).

**Resilience rules (every outbound call)**
- Always set a **timeout** (default 2s for internal calls).
- Wrap calls to other services in a **circuit breaker**: Resilience4j (Java), `opossum` (Node), Polly (.NET), `pybreaker`/`tenacity` (Python).
- Retry only **idempotent reads**, at most twice, with backoff. **Never auto-retry non-idempotent writes** without an idempotency key.
- Decide a fallback explicitly (cached data, degraded response, or `503 UPSTREAM_UNAVAILABLE`).

**Service resolution:** call other services by their compose/Kubernetes service name from env (e.g. `CATALOG_GRPC_TARGET`). Never hardcode hosts. Resolution will later move behind Consul without changing service code.

---

## 8. Messaging (planned, do not implement ahead of the plan)

- **Kafka** carries events (facts). **RabbitMQ** carries commands and timers (work to do). Do not mix the two roles.
- Planned topics: `catalog.events`, `booking.events`, `payment.events`, `auth.events`. Message key = aggregate ID.
- Every event uses this envelope:
  ```json
  {
    "eventId": "uuid",
    "eventType": "EventPublished",
    "occurredAt": "2026-11-01T18:30:00Z",
    "aggregateId": "uuid",
    "aggregateVersion": 3,
    "requestId": "uuid",
    "payload": { }
  }
  ```
- Events are published through the **transactional outbox** (the outbox row is written in the same DB transaction as the state change). Never publish to a broker directly from inside a business transaction.
- Delivery is at-least-once, so **every consumer must be idempotent** (dedupe on `eventId`).
- Event schemas live in `shared/events/`. Event types are past tense (`BookingConfirmed`).

---

## 9. Data rules

- **Database per service.** Only the owning service connects to its datastore. Another service needs data? Call its API or consume its events.
- Each service uses its **own database credentials** with least privilege. No shared users.
- Schema changes go through migrations (Prisma Migrate for Auth, Flyway for Booking, and so on). Never edit a deployed database by hand.
- Soft facts to remember: Auth is Postgres, Catalog is MongoDB (run as a single-node **replica set** so change streams work later), Booking is MySQL plus Redis.
- Money is stored as integer minor units. Timestamps stored in UTC.
- Redis is a cache or lock store with its own instance per owning service. It is not a system of record (Notification is the one deliberate exception).

---

## 10. Configuration and secrets

- **All configuration comes from environment variables.** Nothing environment-specific is hardcoded.
- Every service validates its env on boot and **fails fast** with a clear message if something required is missing or malformed.
- Every service reads the HTTP port from **`PORT`** (Spring: `server.port=${PORT:4003}`).
- Shared variable names (use exactly these): `PORT`, `NODE_ENV` (or the stack's equivalent), `LOG_LEVEL`, `AUTH_JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE`. Datastore and upstream URLs are service-specific and documented in that service's `.env.example`.
- `.env.example` is committed with safe placeholder values. `.env` is git-ignored. Never commit real secrets.
- Containers: multi-stage builds, run as **non-root**, no secrets baked into images, pinned base image versions.

---

## 11. Observability and health

**Health endpoints** (not routed through the gateway; used by Docker and Kubernetes):
- `GET /health/live`: process is up.
- `GET /health/ready`: dependencies are reachable (run a trivial DB query).

**Logging:** structured **JSON to stdout** (never log files). Required fields: `timestamp`, `level`, `service`, `requestId`, `message`. Use `pino` (Node), standard `logging` with a JSON formatter (Python), Logback JSON (Java).

**Metrics:** expose Prometheus metrics at `/metrics` (`prom-client`, `prometheus_client`, Micrometer). Not routed through the public gateway.

**Tracing:** OpenTelemetry later. Keep propagating `X-Request-Id` now so traces can be joined.

---

## 12. Docker and local development

**Compose files** live in `infra/docker/`. Infrastructure uses **profiles**, so each person starts only what they need.

| Compose service | Host port | Profile |
|---|---|---|
| `auth-db` (Postgres) | 5433 | `auth` |
| `catalog-db` (MongoDB, replica set) | 27018 | `catalog` |
| `booking-db` (MySQL) | 3307 | `booking` |
| `booking-redis` | 6380 | `booking` |
| `gateway-redis` | 6379 | `gateway` |

```bash
# start only what you need
docker compose -f infra/docker/docker-compose.infra.yml --profile auth up -d
docker compose -f infra/docker/docker-compose.infra.yml --profile catalog --profile booking up -d
```

Naming rules: compose service name = service folder name (`auth`, `gateway`, `catalog`, `booking`); its datastores are `<service>-db` / `<service>-redis`. Inside the compose network, services reach each other by those names, not `localhost`.

**Daily development:** run your service natively against containerized databases.

| Stack | Command |
|---|---|
| TypeScript | `npm run dev` |
| Python | `uvicorn app.main:app --reload --port 4002` |
| Java | `./mvnw spring-boot:run` |

`docker-compose.apps.yml` runs everything as containers for integration testing. Via the full stack, **only the gateway (8080) is the public entry point**; in Kubernetes only the ingress reaches it.

CORS is configured **only at the gateway**. Services do not add their own CORS headers (it causes duplicates). Global rate limiting is also the gateway's job; Auth keeps its own login limiter as defense in depth.

---

## 13. Git workflow

- Branches: `feat/<service>-<topic>`, `fix/<service>-<topic>`, `chore/<topic>`. Never push straight to `main`.
- Commits use Conventional Commits with the service as scope: `feat(auth): add JWKS endpoint`, `fix(booking): sort seats before update`.
- PRs: small, one concern, description says what changed and how it was tested. `CODEOWNERS` routes review to the folder owner. Changes to `shared/`, `infra/docker/` or this file need approval from **both** teammates.
- Do not commit: `.env`, `keys/`, `node_modules/`, `dist/`, `target/`, `__pycache__/`, generated gRPC stubs, IDE folders.

---

## 14. Testing and definition of done

A task is done only when:
1. It matches the service spec in `docs/specs/` and the conventions in this file (envelopes, codes, auth, naming).
2. Lint, typecheck/build and tests pass locally.
3. New endpoints have tests covering success, validation failure (400), unauthenticated (401), and forbidden (403) where relevant.
4. The service starts from a clean clone using only its README and `.env.example`.
5. `/health/live` and `/health/ready` work.
6. README and `.env.example` reflect any new routes or env vars.
7. If a new public route was added, the gateway route table was updated.
8. No secrets, no debug leftovers, no unrelated changes in the diff.

Concurrency-sensitive code (seat holds) must have a test that proves the guarantee, e.g. many parallel hold requests for one seat, exactly one succeeds.

---

## 15. Stack-specific rules

**TypeScript (auth, gateway)**
- ESM: `"type": "module"`, `module` and `moduleResolution` set to `NodeNext`, `strict: true`, `verbatimModuleSyntax: true`.
- Every **relative import needs a `.js` extension** (even in `.ts` files). Type-only imports must use `import type`.
- `tsconfig` `include` is `["src/**/*.ts"]`. Env validated with `zod`. Logging with `pino`.
- Layers: `routes → controllers → services → data access`. `app.ts` builds the Express app and never calls `.listen()`; `index.ts` is the entry point (connect, listen, graceful shutdown).
- **Prisma (auth):** keep `provider = "prisma-client-js"` with `engineType = "binary"` and the default output (`@prisma/client`). Do **not** switch to the newer `prisma-client` generator or a custom `output` path; both have known bugs in this setup.

**Python (catalog, support-rag)**
- Python 3.12, type hints everywhere, Pydantic v2, `ruff` for lint and format.
- Register exception handlers so FastAPI's validation (422), HTTP, and unexpected errors all return the §5.4 envelope with `400 VALIDATION_ERROR`.
- Pydantic models use `camelCase` aliases for JSON.

**Java (booking)**
- Java 21, Maven, Spring Boot, Flyway for schema, constructor injection.
- A global `@RestControllerAdvice` produces the §5.4 envelope. Also configure Spring Security's `AuthenticationEntryPoint` and `AccessDeniedHandler` to emit the same JSON for 401/403.
- Jackson: ISO-8601 dates (`write-dates-as-timestamps=false`), `camelCase` fields.

**C# and PHP:** conventions will be added when those services start. Until then the same API, auth and config rules in this file apply.

---

## 16. Service notes (details live in `docs/specs/`)

- **auth:** registration, login, refresh rotation, RBAC, JWKS. Issues RS256 tokens; refresh tokens are opaque and hashed. Publishes `UserRegistered` later via outbox.
- **gateway:** single public entry. Route table is data in `config/routes.ts`, with per-route auth mode (`public` / `optional` / `required`) and allowed roles. Forwards `Authorization` untouched, uses raw-body forwarding, circuit breaker per upstream, never retries POST. Upstream URLs come from env now, Consul later.
- **catalog:** events, tiers, venues, publish lifecycle. Owner-only edits. Tiers are immutable after publish. Exposes REST, read-only GraphQL, and gRPC `GetEventForBooking`. Does not know seat availability.
- **booking:** numbered seats per tier (labels like `V-12`), MySQL is the source of truth for holds (conditional `UPDATE`, sorted seat order), Redis `SET NX PX` is a fast front door. Hold TTL 10 minutes, max 6 seats per booking. Orchestrates the booking saga later.

---

## 17. Changing this file

Conventions only help if everyone follows the same ones. To change a rule, open a PR editing this file, get **both** teammates to approve, and merge before any code relies on the new rule. Never let code and this file disagree.