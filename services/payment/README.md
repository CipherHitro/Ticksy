# Ticksy Payment Service (.NET 10 / C#)

The **Payment Service** handles provider orders (Razorpay), processes payment webhooks, tracks payment states, handles administrative refunds, and reliably publishes domain events using the Transactional Outbox pattern.

It is invoked internally by the **Booking Service** over **gRPC** to create orders before attendees enter the checkout funnel, and it receives webhook events from **Razorpay** as the source of truth for captured payments.

---

## 🚀 Responsibilities & Architecture

- **gRPC Server (Port 50054, HTTP/2):**
  - Serves `ticksy.payment.v1.PaymentService`.
  - `CreatePayment`: Initiates order with Razorpay, stores payment entity with status `CREATED`, and returns provider order ID + public key.
  - `GetPayment`: Returns payment status and booking ID for internal service lookups.
- **REST Minimal APIs (Port 4004, HTTP/1.1):**
  - `POST /api/v1/payments/webhooks/razorpay`: Public endpoint receiving Razorpay webhooks (`payment.captured`, `payment.failed`). Verifies HMAC-SHA256 signature against the raw body bytes and deduplicates events.
  - `POST /api/v1/payments/{id}/verify`: Client verification flow (convenience endpoint for checkout confirmation, useful in local dev).
  - `GET /api/v1/payments/{id}`: Owner or ADMIN lookup of payment status and timestamps.
  - `POST /api/v1/payments/{id}/refund`: ADMIN-only refund endpoint that triggers provider refund and records the refund audit log.
- **Security & JWT Authentication:**
  - RS256 token verification via `Microsoft.AspNetCore.Authentication.JwtBearer`.
  - Automatically fetches JWKS public keys via OpenID Connect discovery (`/.well-known/openid-configuration`).
  - Standard Ticksy error response shape for 401 (`UNAUTHENTICATED`) and 403 (`FORBIDDEN`).
- **Data & Concurrency:**
  - Database: **PostgreSQL 16 Alpine** using Entity Framework Core (`Npgsql.EntityFrameworkCore.PostgreSQL`).
  - Ultra-lightweight footprint: ~45 MB image, ~25 MB RAM (ideal for resource-constrained EC2 instances).
  - Optimistic concurrency control using an integer `Version` concurrency token.
  - Idempotency via unique indexes on `booking_id`, `provider_order_id`, and `provider_event_id`.
- **Transactional Outbox:**
  - Saves `OutboxEvents` inside the same database transaction as payment state transitions.
  - Background `OutboxWorker` polls and delivers events.
- **Observability:**
  - Structured JSON logging to stdout via **Serilog**.
  - Prometheus metrics exposed at `GET /metrics`.
  - Health checks: `GET /health/live` and `GET /health/ready` (EF Core database ping).

---

## 🛠️ Tech Stack

- **Language / Runtime:** C# 13, .NET 10.0 (ASP.NET Core Minimal APIs)
- **Database:** PostgreSQL 16 Alpine (`postgres:16-alpine`)
- **ORM:** Entity Framework Core 10 (`Npgsql.EntityFrameworkCore.PostgreSQL`)
- **gRPC:** `Grpc.AspNetCore`
- **Payment Gateway:** Razorpay .NET SDK (`Razorpay`)
- **Authentication:** `Microsoft.AspNetCore.Authentication.JwtBearer`
- **Logging & Metrics:** `Serilog.AspNetCore`, `prometheus-net.AspNetCore`
- **Testing:** xUnit, .NET Test SDK

---

## 📋 Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Listening HTTP port (REST APIs) | `4004` |
| `GRPC_PORT` | Listening gRPC port (HTTP/2) | `50054` |
| `ASPNETCORE_ENVIRONMENT` | Environment (`Development`, `Production`) | `Development` |
| `PAYMENT_DB_CONNECTION` | PostgreSQL connection string | `Host=localhost;Port=5434;Database=payment_db;Username=postgres;Password=postgres` |
| `AUTH_SERVICE_URL` | Auth service base URL | `http://localhost:4001` |
| `JWT_ISSUER` | Expected JWT issuer (`iss`) | `ticksy-auth` |
| `JWT_AUDIENCE` | Expected JWT audience (`aud`) | `ticksy-api` |
| `AUTH_JWKS_URL` | Auth service JWKS endpoint | `http://localhost:4001/.well-known/jwks.json` |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay API Key Secret | `secret_...` |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Webhook Secret | `webhook_secret_...` |
| `LOG_LEVEL` | Logging level | `Information` |

---

## 🏃 How to Run Locally

### Option 1: Run Full Stack via Docker Compose (Recommended)
You can run all services and databases (`auth-db`, `auth-service`, `gateway`, `payment-db`, and `payment-service`) with a single command from the project root:

```bash
docker compose -f infra/docker-compose.yml up --build -d
```

To view live logs from the containerized payment service:
```bash
docker logs -f payment-service
```

### Option 2: Run Payment Service Natively (Development)
If you prefer running just the database in Docker and the payment service directly with the .NET SDK:

1. **Start PostgreSQL Database:**
   ```bash
   docker compose -f infra/docker-compose.yml up -d payment-db
   ```

2. **Configure Environment:**
   ```bash
   cp services/payment/.env.example services/payment/.env
   ```

3. **Start the Service:**
   ```bash
   cd services/payment/src/Ticksy.Payment.Api
   dotnet run
   ```

The service listens on:
- HTTP REST API: `http://localhost:4004` (Direct) or `http://localhost:8080/api/v1/payments/*` (via Gateway)
- gRPC Server: `http://localhost:50054` (HTTP/2)

### 4. Run Tests
```bash
cd services/payment
dotnet test
```

---

## 📡 API Endpoints

### Public Webhook
- `POST /api/v1/payments/webhooks/razorpay`
  - Header: `X-Razorpay-Signature: <hex_hmac>`
  - Body: Raw JSON payload sent by Razorpay

### Authenticated Endpoints (Bearer Token required)
- `GET /api/v1/payments/{id}` (Owner or ADMIN)
- `POST /api/v1/payments/{id}/verify` (Owner)
  - Body: `{ "razorpayPaymentId": "pay_...", "razorpaySignature": "..." }`
- `POST /api/v1/payments/{id}/refund` (ADMIN only)
  - Body: `{ "reason": "Event cancelled" }`

### Diagnostics & Monitoring
- `GET /health/live`: Process liveness check
- `GET /health/ready`: Database connectivity check
- `GET /metrics`: Prometheus performance metrics
