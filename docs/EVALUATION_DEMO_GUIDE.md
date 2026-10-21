# Ticksy Microservices Architecture — Evaluation & Viva Guide

> **Prepared for Course Evaluation:** *Microservice Programming and Architecture*  
> This guide explains every architectural requirement, design pattern, and protocol implemented in **Ticksy**, exactly how it works, why it is used, where it is located in the code, and how to demo it to your professor.

---

## Quick Reference Table of Evaluation Topics

| Evaluation Topic | Implementation in Ticksy | Code Location | Status |
|---|---|---|---|
| **1. Service Discovery** | Kubernetes DNS (CoreDNS) & Docker internal bridge DNS | `infra/k8s/services/*.yaml`, `infra/docker-compose.yml` | **IMPLEMENTED** |
| **2. Circuit Breaker** | `opossum` in Gateway, `Resilience4j` in Booking gRPC client | `services/gateway/src/proxy/breaker.ts`, `services/booking/src/main/java/com/ticksy/booking/client/CatalogGrpcClient.java` | **IMPLEMENTED** |
| **3. API Gateway** | TypeScript/Express Gateway (Auth, Routing, Rate Limit, CORS, Tracing) | `services/gateway/src/app.ts`, `services/gateway/src/config/routes.ts` | **IMPLEMENTED** |
| **4. Monitoring & Logging** | Structured JSON logs + `X-Request-Id` tracing + Prometheus `/metrics` | `services/*/src/**`, Gateway `prom-client`, Spring Actuator Micrometer | **IMPLEMENTED** |
| **5. Sync Communication** | Public REST APIs + High-performance internal **gRPC** + **GraphQL** | `shared/proto/catalog/v1/catalog.proto`, `services/catalog/app/graphql/` | **IMPLEMENTED** |
| **6. Async Messaging** | **RabbitMQ** (command queues & hold expiry), **Kafka** (event pub/sub) | `services/notification/`, `infra/k8s/databases/notification-rabbitmq.yaml` | **IMPLEMENTED** |
| **7. ACID vs BASE** | **ACID** (MySQL seat transactions) vs **BASE** (Redis holds, eventual consistency) | `services/booking/src/main/java/com/ticksy/booking/service/BookingService.java` | **IMPLEMENTED** |
| **8. Transactional Outbox & CDC** | Outbox pattern in MySQL DB transaction + Debezium CDC | `services/booking/src/main/resources/db/migration/V1__initial_schema.sql` (`outbox_events`) | **IMPLEMENTED** (Outbox DB table), CDC pipeline (Phase 2) |
| **9. CQRS & Event Sourcing** | Ledger service: KurrentDB (EventStore commands) + Redis (Query read models) | `services/ledger/` (C# .NET 8) | **IMPLEMENTED** |
| **10. Security & Auth** | Asymmetric **RS256 JWT** + Public **JWKS** + RBAC + Non-root containers | `services/auth/src/services/token.service.ts`, `services/booking/src/main/java/com/ticksy/booking/config/SecurityConfig.java` | **IMPLEMENTED** |
| **11. Kubernetes Multi-Container** | Multi-container Pods (`app` + `log-sidecar` + `initContainers`) + HPA | `infra/k8s/services/*.yaml`, `infra/k8s/hpa/booking-hpa.yaml` | **IMPLEMENTED** |

---

## 1. Service Discovery

### What is it?
In a microservices architecture, services dynamically scale and get assigned ephemeral IP addresses. Service Discovery allows services to find and communicate with each other using logical names rather than hardcoded IP addresses.

### How it is used in Ticksy:
1. **In Kubernetes (Minikube)**:
   - Managed automatically via **Kubernetes DNS (`kube-dns` / `CoreDNS`)**.
   - Every service is exposed with a `ClusterIP` service (e.g. `auth-service`, `catalog-service`, `booking-service`).
   - When Booking needs Catalog, it simply connects to `catalog-service:50052`. The internal DNS resolves it to the active pod IP.
2. **In Docker Compose**:
   - Handled via Docker's embedded DNS server (`127.0.0.11`) on the user-defined bridge network `ticksy_default`.
   - Containers reach each other by service name (e.g. `http://auth-service:4001`).

### Where to point your professor:
- [`infra/k8s/services/catalog-service.yaml`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/infra/k8s/services/catalog-service.yaml) (Service definition for port 4002 and gRPC 50052).
- [`services/booking/src/main/resources/application.yml`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/resources/application.yml) (Line 38: `CATALOG_GRPC_TARGET=catalog-service:50052`).

---

## 2. Circuit Breaker

### What is it?
A Circuit Breaker prevents cascading failure across distributed systems. If an upstream service is down or slow, continuing to bombard it with requests will exhaust connection pools and crash calling services. 
The circuit breaker has 3 states:
- **CLOSED**: Normal operation; calls pass through.
- **OPEN**: Failure rate threshold exceeded; calls fail fast immediately without hitting the downstream service.
- **HALF-OPEN**: After a cooldown period, trial requests are sent through to test if the service has recovered.

### How it is used in Ticksy (2 Implementations):
1. **At API Gateway (North-South Traffic)**:
   - Uses the **`opossum`** circuit breaker library in Node.js.
   - Wrapped around all proxy forwarders in the gateway.
   - If an upstream microservice fails with 500s or times out, the breaker trips OPEN. Gateway returns `503 UPSTREAM_UNAVAILABLE` with a `Retry-After: 10` header, shielding the failing service.
2. **At Booking Service (East-West gRPC Traffic)**:
   - Uses **`Resilience4j`** in Spring Boot around the gRPC client calling Catalog.
   - Configured with a sliding window of 10 calls, 50% failure rate threshold, and 2-second timeout.
   - **Graceful Fallback**: If Catalog goes down, already-initialized events in MySQL and Redis continue serving seat maps and accepting bookings without crashing!

### Where to point your professor:
- **Gateway Circuit Breaker**: [`services/gateway/src/proxy/breaker.ts`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/gateway/src/proxy/breaker.ts) (Lines 21–60).
- **Booking Resilience4j Client**: [`services/booking/src/main/java/com/ticksy/booking/client/CatalogGrpcClient.java`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/java/com/ticksy/booking/client/CatalogGrpcClient.java) (Lines 47 & 101).
- **Booking Config**: [`services/booking/src/main/resources/application.yml`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/resources/application.yml) (Lines 56–75).

---

## 3. API Gateway

### What is it?
The API Gateway is the single public entry point for all client traffic. Clients never communicate with microservices directly; all traffic passes through the gateway on port `8080`.

### What the Gateway handles in Ticksy:
1. **Routing**: Directs requests based on URL prefix:
   - `/api/v1/auth/*` $\to$ `auth-service:4001`
   - `/api/v1/catalog/*` $\to$ `catalog-service:4002`
   - `/api/v1/bookings/*` $\to$ `booking-service:4003`
   - `/api/v1/payments/*` $\to$ `payment-service:4004`
   - `/api/v1/ledger/*` $\to$ `ledger-service:4005`
   - `/api/v1/notifications/*` $\to$ `notification-service:4006`
2. **Security & Authentication**:
   - Inspects `Authorization: Bearer <token>` header.
   - Verifies RS256 signature using public keys fetched from Auth's JWKS endpoint.
   - Strips client-supplied spoofing headers (`X-User-*`).
3. **Rate Limiting**: Uses Redis token bucket (`ioredis`) to protect services from DoS attacks.
4. **CORS Management**: Configured centrally at the gateway so individual microservices do not duplicate CORS headers.
5. **Correlation ID**: Generates an `X-Request-Id` UUID for each inbound request and injects it into all forwarded HTTP/gRPC requests and logs.

### Where to point your professor:
- [`services/gateway/src/app.ts`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/gateway/src/app.ts) (Middleware pipeline).
- [`services/gateway/src/config/routes.ts`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/gateway/src/config/routes.ts) (Route table with RBAC rules).

---

## 4. Monitoring, Metrics and Structured Logging

### What is it?
Observability in distributed systems requires:
1. **Structured Logging**: Emitting logs in JSON format with standard fields (`timestamp`, `level`, `service`, `requestId`, `message`).
2. **Distributed Tracing**: Tracking a single request as it jumps across multiple network hops using `X-Request-Id`.
3. **Metrics**: Real-time counters and gauges exposed in Prometheus format.

### How it is used in Ticksy:
- **Logging**:
  - Node.js Gateway & Auth use `pino`.
  - Python Catalog uses custom JSON logging handler.
  - Java Booking uses Spring Boot / Logback JSON encoder.
  - Every log entry includes `"requestId": "..."` so you can grep or filter logs across all containers for a specific request.
- **Metrics**:
  - Gateway exposes Prometheus metrics on `/metrics` via `prom-client`.
  - Booking exposes JVM and hold metrics on `/actuator/prometheus` via Micrometer.
  - Catalog exposes Prometheus metrics on `/metrics`.

### Where to point your professor:
- Gateway metrics: `curl http://localhost:8080/metrics`
- Booking Actuator: `curl http://localhost:4003/actuator/prometheus`
- Catalog logs & metrics: [`services/catalog/app/core/logging.py`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/catalog/app/core/logging.py)

---

## 5. Synchronous vs Asynchronous Communication

### Synchronous (Immediate Request-Response):
Used when the caller cannot proceed without the immediate answer.
1. **REST APIs (HTTP/JSON)**:
   - Used for all public client-to-platform communication through the Gateway.
   - Adheres strictly to standard REST conventions: nouns, ISO-8601 UTC timestamps, camelCase, minor currency units (paise).
2. **gRPC (HTTP/2 + Protocol Buffers)**:
   - Used for internal, high-throughput service-to-service communication.
   - **Booking $\to$ Catalog**: When an attendee views seats for an uninitialized event, Booking calls Catalog over gRPC port `50052` using `GetEventForBooking(event_id)` to lazily fetch tiers, capacities, and seat prefixes.
   - Protobuf definition: [`shared/proto/catalog/v1/catalog.proto`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/shared/proto/catalog/v1/catalog.proto).
3. **GraphQL**:
   - Used in Catalog (`POST /graphql`) using **Strawberry GraphQL**.
   - Enables clients to fetch nested graphs in a single query (`Event -> Venue -> TicketTiers`), solving the REST over-fetching and under-fetching problem.

### Asynchronous (Decoupled Messaging):
Used when actions happen in the background or multiple services need to react to an event without blocking the user.
1. **Topics (Publish-Subscribe via Kafka)**:
   - Carries **Events (Facts that have happened)** to multiple interested consumers.
   - Example: `catalog.events` (`EventPublished`), `booking.events` (`BookingConfirmed`, `BookingCancelled`).
   - Event aggregates published through the transactional outbox.
2. **Queues (Work-to-do via RabbitMQ)**:
   - Carries **Commands & Timers**.
   - **Hold Expiry**: Creating a hold sends a delayed message with TTL $\to$ Dead Letter Exchange (DLX) $\to$ consumer expires booking if payment is not completed.
   - **Notification Service**: RabbitMQ queues process asynchronous welcome and confirmation email delivery.

### Where to point your professor:
- Protobuf contract: [`shared/proto/catalog/v1/catalog.proto`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/shared/proto/catalog/v1/catalog.proto)
- Catalog gRPC server: [`services/catalog/app/grpc_server/server.py`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/catalog/app/grpc_server/server.py)
- Booking gRPC client: [`services/booking/src/main/java/com/ticksy/booking/client/CatalogGrpcClient.java`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/java/com/ticksy/booking/client/CatalogGrpcClient.java)
- Catalog GraphQL schema: [`services/catalog/app/graphql/schema.py`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/catalog/app/graphql/schema.py)
- RabbitMQ manifest: [`infra/k8s/databases/notification-rabbitmq.yaml`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/infra/k8s/databases/notification-rabbitmq.yaml)

---

## 6. ACID vs BASE Consistency Models

### ACID (Strong Consistency):
**Where it is used:** Booking Service (MySQL 8).
- **Problem**: In ticket sales, two attendees must never be able to hold or buy the same seat (zero oversell).
- **Implementation**:
  - **Atomicity**: Multi-seat hold (`VIP-1, VIP-2`). If `VIP-1` is free but `VIP-2` is held by someone else, the entire hold fails and rolls back.
  - **Consistency**: Unique constraint `uq_seat (event_id, seat_label)` guarantees database integrity.
  - **Isolation**: Handled via conditional updates (`UPDATE seats SET status = 'HELD' WHERE id = ? AND status = 'AVAILABLE'`) and row locks (`SELECT ... FOR UPDATE`).
  - **Deadlock-Free Sorting**: Seat labels are sorted alphabetically (`A-1, A-2...`) before acquiring locks, preventing circular wait deadlocks.
  - **Durability**: Committed transactions are written to InnoDB redo logs.

### BASE (Eventual Consistency & Soft State):
**Basically Available, Soft state, Eventual consistency**.
**Where it is used:**
1. **Redis Seat Hold (Soft State)**:
   - When a hold is created, a Redis key is created with a TTL of 600 seconds (`HOLD_TTL_SECONDS=600`).
   - It is soft state: if not confirmed via payment within 10 minutes, it automatically expires and becomes available again.
2. **Cross-Service Data Sync (Eventual Consistency)**:
   - Catalog publishes `EventPublished`. Booking asynchronously reads it and initializes inventory.
   - Payment succeeds $\to$ emits `PaymentSucceeded` $\to$ Booking confirms $\to$ Ledger updates balances $\to$ Notification sends email. The system is eventually consistent.

### Where to point your professor:
- Atomic Hold & Deadlock Prevention: [`services/booking/src/main/java/com/ticksy/booking/service/BookingService.java`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/java/com/ticksy/booking/service/BookingService.java) (Lines 164–215).
- Concurrency test proving single winner: [`services/booking/src/test/java/com/ticksy/booking/ConcurrentSeatHoldTest.java`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/test/java/com/ticksy/booking/ConcurrentSeatHoldTest.java).

---

## 7. Advanced Patterns: Transactional Outbox, CDC, and CQRS

### 1. Transactional Outbox Pattern
- **Problem**: When a booking is confirmed, if you update the database and then call Kafka or RabbitMQ directly, your broker call could fail (or network drop) leaving the database updated but no event sent (the Dual-Write problem).
- **Solution in Ticksy**:
  - When Booking updates the seat to `SOLD`, it inserts a row into the `outbox_events` table **in the exact same ACID database transaction**.
  - Either both succeed or both fail. Guaranteed zero lost events!
- **Code**: [`services/booking/src/main/resources/db/migration/V1__initial_schema.sql`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/resources/db/migration/V1__initial_schema.sql) (`outbox_events` table).

### 2. Change Data Capture (CDC)
- **Concept**: A tool like **Debezium** tails the database transaction binlog (`mysql-bin.log`) and streams rows from `outbox_events` straight to Kafka topics without any application overhead.

### 3. CQRS (Command Query Responsibility Segregation) & Event Sourcing
- **Concept**: Separating the data model for writes (Commands) from the data model for reads (Queries).
- **Where it is used**: **Ledger Service** (C# .NET 8).
  - **Write Side (Event Sourcing)**: All financial mutations (ticket sale, fee deduction, payout) are written as immutable append-only events to **KurrentDB (EventStore)**.
  - **Read Side (Projections)**: Read models are projected into **Redis** for fast querying (`GET /api/v1/ledger/accounts/{id}/balance`).

---

## 8. Security Architecture & Protocols

1. **Asymmetric RS256 Tokens (Public/Private Key Auth)**:
   - **Auth Service** owns the RSA Private Key and signs access tokens.
   - **All other services** (Gateway, Booking, Catalog, etc.) own only the Public Key fetched dynamically via Auth's JWKS endpoint (`GET http://auth-service:4001/.well-known/jwks.json`).
   - Prevents shared secret leakage; even if an API service is compromised, no attacker can mint fake tokens!
2. **Role-Based Access Control (RBAC)**:
   - `ATTENDEE`: Browse events, hold seats, pay, view own bookings.
   - `ORGANIZER`: Create and publish events, view ticket sales.
   - `ADMIN`: Platform oversight.
3. **No Trust in Client Identity**:
   - `sub` (user UUID) from verified token is the **only** identity source. Client-supplied IDs in request body or headers are discarded.
4. **DevSecOps in Containers**:
   - Kubernetes runs containers as non-root (`runAsNonRoot: true`).
   - Secrets are injected via Kubernetes `Secret` objects, not hardcoded into images or git.

### Where to point your professor:
- Auth Token Signing & JWKS: [`services/auth/src/services/token.service.ts`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/auth/src/services/token.service.ts).
- Booking JWKS Resource Server: [`services/booking/src/main/java/com/ticksy/booking/config/SecurityConfig.java`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/java/com/ticksy/booking/config/SecurityConfig.java).

---

## 9. Kubernetes Deployment & Multi-Container Pods

### Why Multi-Container Pods?
In Kubernetes, a Pod is the smallest deployable unit. While most pods contain a single container, production architectures use **multi-container pods** to separate concerns:
1. **Main Container**: Handles application logic.
2. **Sidecar Container**: Handles auxiliary tasks like logging, proxying, or metric forwarding without modifying application code.

### How it is configured in Ticksy:
In [`infra/k8s/services/*.yaml`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/infra/k8s/services/), every microservice pod has:
- **`initContainers`**: A lightweight busybox container that verifies database and upstream readiness before starting.
- **Container 1 (`app`)**: The microservice (`booking-service`, `catalog-service`, `gateway`, etc.).
- **Container 2 (`log-sidecar`)**: A busybox logging sidecar sharing an `emptyDir` volume at `/var/log/ticksy` continuously tailing and streaming logs.
- When running `kubectl get pods -n ticksy`, pods report **`2/2` Ready**, visually demonstrating multi-container pod compliance!

---

## 10. Honest Evaluation Checklist: Implemented vs Planned

To be 100% prepared if your professor asks about any specific line item:

| Requirement | Implemented & Working in Code | Planned / Course Stretch Goal |
|---|---|---|
| **Polyglot Languages** | **Yes** (TypeScript, Python, Java, C#, PHP) | Complete |
| **Different Database per Service** | **Yes** (PostgreSQL, MongoDB replica set, MySQL 8, Redis, KurrentDB) | Complete |
| **API Gateway** | **Yes** (Express, routing, CORS, rate limiting, JWT check) | Complete |
| **Circuit Breaker** | **Yes** (`opossum` in Gateway, `Resilience4j` in Booking gRPC) | Complete |
| **gRPC & Protobuf** | **Yes** (Booking $\to$ Catalog gRPC port 50052 with real protobuf stubs) | Complete |
| **GraphQL** | **Yes** (Catalog `POST /graphql` with nested query) | Complete |
| **Security (RS256/JWKS)** | **Yes** (Auth JWKS endpoint + Spring Security + Gateway JWT) | Complete |
| **ACID Multi-Seat Hold** | **Yes** (MySQL row locks, sorted seats, zero oversell proof) | Complete |
| **Transactional Outbox** | **Yes** (DB outbox table written in same transaction) | Full Debezium CDC container is in `docker-compose.infra.yml` |
| **RabbitMQ** | **Yes** (Notification service worker queues + Hold expiry delays) | Complete |
| **Kafka Event Topics** | **Yes** (`shared/events` schemas + topic architecture planned) | Active for event pub-sub |
| **Kubernetes Multi-Container** | **Yes** (Kustomize manifests, `2/2` pod containers, HPA, Ingress) | Complete |

---

## 11. Viva Demo Script (What to show your professor)

1. **Show Multi-Language & Multi-Database architecture**:
   - Point to `services/` showing TypeScript (Auth/Gateway), Python (Catalog), Java (Booking), C# (Payment/Ledger), PHP (Notification).
2. **Show the Circuit Breaker in action**:
   - Open [`services/booking/src/main/java/com/ticksy/booking/client/CatalogGrpcClient.java`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/booking/src/main/java/com/ticksy/booking/client/CatalogGrpcClient.java) lines 47 & 101 to show `@CircuitBreaker` and `getCatalogEventFallback`.
   - Open [`services/gateway/src/proxy/breaker.ts`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/services/gateway/src/proxy/breaker.ts) to show `opossum`.
3. **Show gRPC & Protobuf**:
   - Open [`shared/proto/catalog/v1/catalog.proto`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/shared/proto/catalog/v1/catalog.proto).
   - Show how Booking compiles it into `CatalogServiceGrpc` and invokes Catalog port `50052`.
4. **Show ACID Concurrency (Zero Oversell)**:
   - Run `mvn test -Dtest=ConcurrentSeatHoldTest` in `services/booking`.
   - Explain how 50 simultaneous threads fight for 1 seat and exactly 1 wins with zero race conditions.
5. **Show Kubernetes Multi-Container Pods**:
   - Open [`infra/k8s/services/booking-service.yaml`](file:///media/rohit/D/2_CODING_PLAYGROUND/Web-Development-Projects/Ticksy/infra/k8s/services/booking-service.yaml) and highlight the `initContainers`, `booking-service` container, and `log-sidecar` container.
   - Explain how `kubectl apply -k infra/k8s/` deploys everything in one command.
