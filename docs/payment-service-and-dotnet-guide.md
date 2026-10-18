# Ticksy Payment Service & Beginner's Guide to .NET & C#

> This guide is written for engineers who are new to C# and .NET. It explains how .NET works under the hood, how this Payment microservice is designed, how Razorpay integration works, and how to configure webhooks for local development and production.

---

## Part 1: Beginner's Guide to .NET & C# (Mental Model)

If you are coming from JavaScript/TypeScript, Python, or Go, here is how C# and .NET map to things you already know:

### 1. Concepts & Equivalents Table

| Concept | Node.js / TypeScript | Python | .NET / C# | What it means |
|---|---|---|---|---|
| **Solution (`.slnx` or `.sln`)** | Monorepo root / Workspace (`pnpm-workspace.yaml`) | Virtualenv / Project root | Solution (`Ticksy.Payment.slnx`) | A container that groups multiple related projects together. |
| **Project (`.csproj`)** | `package.json` | `pyproject.toml` | Project file (`Ticksy.Payment.Api.csproj`) | Describes dependencies (NuGet packages), target framework (`net10.0`), and compilation settings. |
| **Package Manager** | `npm` / `pnpm` | `pip` / `poetry` | **NuGet** (`dotnet add package ...`) | Downloads pre-built libraries from nuget.org and caches them. |
| **Entry Point** | `src/index.ts` / `src/app.ts` | `main.py` | `Program.cs` | The top-level file executed when the application boots up. |
| **Web Server** | Node `http` or Express | Uvicorn / Gunicorn | **Kestrel** (built-in ASP.NET web server) | High-performance, cross-platform HTTP/1.1 & HTTP/2 web server. |
| **Routing & Handlers** | Express route handlers (`app.post(...)`) | FastAPI path operations (`@app.post(...)`) | **Minimal APIs** (`app.MapPost(...)`) | Lightweight route mapping without boilerplate controllers. |
| **ORM / Database** | Prisma / Drizzle | SQLAlchemy / Tortoise | **Entity Framework Core (EF Core)** | Maps C# classes (Entities) to database tables, executes queries, and tracks changes. |
| **Data Models** | TypeScript `type` / `interface` / Zod | Pydantic `BaseModel` | **`record`** or **`class`** | `class` is mutable (entities); `record` is immutable by default (DTOs, request/response models). |
| **Async Operations** | `async/await` (`Promise<T>`) | `async/await` (`Coroutine`) | `async/await` (`Task<T>`) | Non-blocking I/O. `Task<T>` is the C# equivalent of a JavaScript `Promise<T>`. |
| **Dependency Injection** | Manual passing or InversifyJS | FastAPI `Depends(...)` | Built-in DI Container (`builder.Services`) | You register classes at startup (`AddSingleton`, `AddScoped`), and .NET automatically injects them into your endpoints. |

---

### 2. Anatomy of the Solution Directory

```
services/payment/
├── Ticksy.Payment.slnx           # The solution file: tells IDEs and dotnet CLI which projects belong together
├── Dockerfile                   # Multi-stage container build (builds SDK image, runs minimal runtime)
├── .dockerignore                # Excludes bin/, obj/, and secrets from container image
├── .env.example                 # Template for required environment variables
├── README.md                    # Quickstart and run instructions
├── src/
│   └── Ticksy.Payment.Api/      # The web and gRPC microservice project
│       ├── Ticksy.Payment.Api.csproj # Project definition: NuGet packages and proto references
│       ├── Program.cs           # The main entry point (configuration, DI, pipeline, startup)
│       ├── appsettings.json     # Configuration file (JSON equivalent of default config)
│       ├── appsettings.Development.json # Development-only overrides (local DB strings)
│       │
│       ├── Domain/              # Business Entities (Pure domain logic, no HTTP or DB code)
│       │   ├── Payment.cs       # Aggregate Root: tracks amount, currency, status, provider order ID
│       │   ├── PaymentStatus.cs # Status enum (CREATED, PAID, FAILED, EXPIRED, REFUNDED)
│       │   ├── Refund.cs        # Refund record linked to a Payment
│       │   ├── WebhookEvent.cs  # Deduplication store for incoming provider event IDs
│       │   └── OutboxEvent.cs   # Transactional Outbox entity for reliable async publishing
│       │
│       ├── Data/                # Database layer
│       │   └── PaymentDbContext.cs # EF Core DbContext: configures SQL Server tables, keys, and rowversion
│       │
│       ├── Endpoints/           # HTTP API layer (Minimal APIs)
│       │   ├── PaymentEndpoints.cs  # GET /payments/{id}, POST /verify, POST /refund
│       │   ├── WebhookEndpoints.cs  # POST /webhooks/razorpay (public, raw body HMAC signature check)
│       │   ├── ErrorEnvelope.cs     # Standard Ticksy success and error JSON response records
│       │   └── GlobalExceptionHandler.cs # Intercepts unhandled errors and converts to standard error format
│       │
│       ├── Gateways/            # External integration adapters
│       │   └── RazorpayGateway.cs # Razorpay SDK wrapper: order creation, HMAC signature verification, refunds
│       │
│       ├── Grpc/                # Internal RPC layer
│       │   └── PaymentGrpcService.cs # Implements proto contract for Booking Service (CreatePayment, GetPayment)
│       │
│       ├── Auth/                # Security layer
│       │   ├── AuthContext.cs   # Holds authenticated caller identity (userId, email, role)
│       │   └── AuthContextMiddleware.cs # Extracts validated JWT claims into the request context
│       │
│       └── Messaging/           # Async background jobs
│           └── OutboxWorker.cs  # Background service polling outbox events to simulate reliable event delivery
│
└── tests/
    └── Ticksy.Payment.Tests/    # Unit and Integration test project
        ├── Ticksy.Payment.Tests.csproj
        ├── PaymentDomainTests.cs  # Tests entity state machine transitions and invariants
        └── RazorpayGatewayTests.cs # Tests HMAC-SHA256 signature calculation and constant-time comparison
```

---

### 3. How `Program.cs` Works (The Two-Phase Lifecycle)

In modern .NET (ASP.NET Core), `Program.cs` executes in two clear phases:

1. **The Builder Phase (`WebApplication.CreateBuilder`):**
   - Configures settings and reads environment variables.
   - Registers services in the Dependency Injection (DI) container:
     - `builder.Services.AddDbContext<PaymentDbContext>(...)` -> Database access.
     - `builder.Services.AddAuthentication(...)` -> JWT validation using RS256 and JWKS.
     - `builder.Services.AddSingleton<IRazorpayGateway, RazorpayGateway>()` -> Payment gateway adapter.
     - `builder.Services.AddGrpc()` -> Enables gRPC endpoint handling.
     - `builder.Services.AddHostedService<OutboxWorker>()` -> Starts the background worker task.
   - Configures Kestrel to listen on two distinct ports:
     - Port `4004` (HTTP/1.1) for REST API and webhooks.
     - Port `50054` (HTTP/2) for high-performance internal gRPC communication.

2. **The App Pipeline Phase (`builder.Build()`):**
   - Configures middlewares in order:
     - `UseExceptionHandler` (catches crashes and sends standard `{ success: false, code: ... }`).
     - `UseAuthentication` (checks JWT token on incoming requests).
     - `UseAuthorization` (checks roles like ADMIN).
     - `UseAuthContext` (extracts claims into convenient context object).
   - Maps endpoints:
     - `app.MapHealthChecks(...)` for `/health/live` and `/health/ready`.
     - `app.MapMetrics()` for Prometheus monitoring.
     - `app.MapPaymentEndpoints()` and `app.MapWebhookEndpoints()` for REST routes.
     - `app.MapGrpcService<PaymentGrpcService>()` for gRPC calls.
   - Starts listening via `app.Run()`.

---

## Part 2: How the Payment Service Works

### The End-to-End Payment Flow

```
[Booking Service]
       │
       │ 1. gRPC CreatePayment(bookingId, amountMinor, currency)
       ▼
[Payment Service] ──────► [Razorpay API]
  - creates order           - returns providerOrderId ("order_xxx")
  - saves Payment (CREATED)
       │
       │ 2. Returns providerOrderId + Razorpay Public Key
       ▼
[Booking / Frontend Client]
       │
       │ 3. Frontend opens Razorpay Checkout modal
       │    User enters card / UPI / netbanking
       ▼
[Razorpay Platform]
       │
       │ 4. Asynchronous Webhook HTTP POST
       │    POST /api/v1/payments/webhooks/razorpay
       │    (Header: X-Razorpay-Signature: <HMAC-SHA256>)
       ▼
[Payment Service]
  - Verifies HMAC signature with raw request body
  - Deduplicates using provider event ID (Idempotency)
  - Updates Payment to PAID in DB
  - Inserts OutboxEvent ("PaymentSucceeded") in SAME DB transaction
  - Returns 200 OK immediately
       │
       ▼
[OutboxWorker]
  - Reads OutboxEvent from database
  - Publishes event downstream (e.g. Booking confirmed, Ticket generated)
```

---

## Part 3: What is a Webhook and Why is it Necessary?

### Why can't the frontend client just tell us "I paid"?
In online payments, **you can NEVER trust the user's browser**:
1. **Network Drops:** An attendee might pay on their mobile app, but the battery dies or their connection cuts out right after the bank approves the transaction. The browser never sends the confirmation back.
2. **Fraud & Tampering:** A malicious user could tamper with frontend JavaScript and send a fake "Payment Succeeded" HTTP request without paying any real money.
3. **Async Bank Settlements:** UPI and Netbanking often take a few seconds or minutes to confirm. The checkout modal cannot block the browser forever.

### What is a Webhook?
A **webhook** is a server-to-server HTTP notification sent directly from the payment gateway (Razorpay) to your backend:
- Razorpay calls your server: `POST /api/v1/payments/webhooks/razorpay`.
- Because this request comes over the public internet, **how do we know it really came from Razorpay?**
  - **HMAC-SHA256 Signatures**: Razorpay hashes the entire raw request body using a shared secret known only to you and Razorpay (`RAZORPAY_WEBHOOK_SECRET`). They send the hash in the `X-Razorpay-Signature` header.
  - Your Payment Service computes the hash of the raw body itself using the same secret. If the hashes match exactly, the payload is authentic and has not been tampered with.
  - We use constant-time comparison (`CryptographicOperations.FixedTimeEquals`) to prevent timing attacks.

---

## Part 4: Razorpay Account Setup Guide

To test payments in local development, you need free Razorpay Test credentials:

### 1. Sign up for a Razorpay Test Account
1. Go to [https://dashboard.razorpay.com/](https://dashboard.razorpay.com/) and create a free account.
2. In the top-right or left menu, toggle the switch from **Live Mode** to **Test Mode**. (Test mode requires no bank KYC and never charges real money).

### 2. Generate API Keys
1. In the Razorpay Dashboard, navigate to **Settings** -> **API Keys**.
2. Click **Generate Test Key**.
3. You will see:
   - **Key ID**: starts with `rzp_test_...`
   - **Key Secret**: a string of letters and numbers.
4. Copy both values. These map to your environment variables:
   - `RAZORPAY_KEY_ID=rzp_test_...`
   - `RAZORPAY_KEY_SECRET=...`

### 3. Set Up Webhooks (Local Development vs Production)
In **Settings** -> **Webhooks**:
1. Click **Add New Webhook**.
2. **Webhook URL**:
   - For **Local Development**: Razorpay's cloud servers cannot directly connect to `localhost:8080`. You need a local tunnel like `ngrok` or `cloudflared`:
     ```bash
     ngrok http 8080
     # Or run Cloudflare tunnel:
     cloudflared tunnel --url http://localhost:8080
     ```
     Your webhook URL in the dashboard will be:
     `https://<your-tunnel-subdomain>.ngrok-free.app/api/v1/payments/webhooks/razorpay`
   - For **Production**:
     `https://api.yourdomain.com/api/v1/payments/webhooks/razorpay`
3. **Secret**: Enter any strong random string (e.g. `ticksy_webhook_secret_dev_2026`).
   - Copy this string to your environment variable:
     `RAZORPAY_WEBHOOK_SECRET=ticksy_webhook_secret_dev_2026`
4. **Active Events**: Check the following events:
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
5. Click **Save**.

---

## Part 5: Testing the Payment Service Without Razorpay

You don't need real Razorpay credentials to run automated unit tests or simulate webhooks:

### 1. Run the Automated Unit Tests
```bash
cd services/payment
dotnet test
```
All 14 tests run in-memory, testing domain state transitions, refund workflows, and HMAC-SHA256 signature verification.

### 2. Local Simulation with Mock Webhook
You can simulate a Razorpay webhook using `curl` or a test script:
```bash
# 1. Compute HMAC signature of payload
PAYLOAD='{"id":"evt_test_123","event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test_999","order_id":"order_test_123","amount":50000,"currency":"INR"}}}}'
SECRET="placeholder_webhook_secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

# 2. Send webhook to payment service via Gateway (port 8080)
curl -X POST http://localhost:8080/api/v1/payments/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

---

## Part 6: Key Design Decisions & Best Practices

1. **Database per Service & Ultra-Lightweight Footprint:**
   The Payment service uses its own isolated PostgreSQL 16 Alpine instance (`postgres:16-alpine`), completely separated from Auth (`auth_db`). The image is only ~45 MB and runs in ~25 MB of RAM (unlike SQL Server's 2000 MB requirement), making it rock-solid on small EC2 instances.
2. **Amounts Stored as Minor Units (Paise):**
   No floating point numbers are ever used for money. INR ₹500 is stored as integer `50000`.
3. **Optimistic Concurrency:**
   The `payments` table includes an integer `Version` concurrency token. If two threads or processes try to update the payment status simultaneously, EF Core detects the version collision and throws a `DbUpdateConcurrencyException`.
4. **Transactional Outbox Pattern:**
   State changes and event publishing records (`outbox_events`) are committed within the same database transaction (`await db.SaveChangesAsync()`). This guarantees that an event is never lost even if the application server or message broker restarts.
