# Ticksy Ledger Service

Financial ledger and accounting microservice for the Ticksy live ticketing platform.

## Architecture

- **Stack**: .NET 10 (C#) Minimal APIs, Docker, Serilog, Prometheus
- **Event Sourcing**: Source of truth is an immutable, append-only event stream stored in **KurrentDB** (`account-{organizerId}`).
- **CQRS**: The write side executes the pure `AccountDecider` against reconstituted aggregate state with optimistic concurrency. The read side projects events into fast **Redis** read models (`balance:*`, `statement:*`, `event-sales:*`, `platform:revenue:*`).
- **Idempotency**: Duplicate sales and refunds are safe NO-OPs inside the aggregate.
- **Security**: JWT tokens verified using RSA asymmetric keys (RS256) loaded from Auth Service's JWKS (`/.well-known/jwks.json`).

## Public & Internal Routes

All public traffic routes through the API Gateway (port 8080) under `/api/v1/ledger`:

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/v1/ledger/me/balance` | `ORGANIZER` | Current balance (gross, fees, refunds, payouts, available) with `asOf` |
| `GET` | `/api/v1/ledger/me/statement` | `ORGANIZER` | Paginated financial statement, newest first |
| `GET` | `/api/v1/ledger/me/events` | `ORGANIZER` | Ticket sales and revenue breakdown per event |
| `POST` | `/api/v1/ledger/me/payouts` | `ORGANIZER` | Request a payout (requires `Idempotency-Key` header) |
| `GET` | `/api/v1/ledger/me/payouts` | `ORGANIZER` | Payout history |
| `POST` | `/api/v1/ledger/admin/organizers/{id}/payouts/{pId}/complete` | `ADMIN` | Mark bank transfer complete |
| `POST` | `/api/v1/ledger/admin/organizers/{id}/payouts/{pId}/fail` | `ADMIN` | Mark payout failed and return funds to balance |
| `GET` | `/api/v1/ledger/admin/organizers/{id}/balance` | `ADMIN` | View any organizer's balance |
| `GET` | `/api/v1/ledger/admin/platform/revenue` | `ADMIN` | Daily platform fee revenue report |
| `POST` | `/api/v1/ledger/admin/projections/rebuild` | `ADMIN` | Reset checkpoint and replay event store to rebuild Redis |
| `GET` | `/api/v1/ledger/admin/projections/status` | `ADMIN` | Checkpoint position and projection status |
| `POST` | `/api/v1/ledger/dev/events` | *Dev Only* | Injects inbound events (`BookingConfirmed`, `BookingRefunded`) |

## Running Locally

### 1. Start Infrastructure (KurrentDB & Redis)
```bash
docker compose -f infra/docker-compose.yml up -d ledger-kurrentdb ledger-redis
```

- KurrentDB UI: [http://localhost:2113](http://localhost:2113)
- Redis: `localhost:6381`

### 2. Run the Service
```bash
dotnet run --project services/ledger/src/Ticksy.Ledger.Api
```

### 3. Run Tests
```bash
dotnet test services/ledger/Ticksy.Ledger.slnx
```
