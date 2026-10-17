# API Gateway Architecture & Design Documentation

## 1. Overview & System Role

The Ticksy API Gateway serves as the single entry point for all incoming HTTP/GraphQL client traffic on port **8080**. It abstracts internal microservice topology, enforces platform-wide security, handles edge authentication, rate limits clients, and manages resilient forwarding to upstream microservices.

```
Client Requests (Browser / Mobile / Webhooks)
                         │
                         ▼
             ┌───────────────────────┐
             │  API Gateway (8080)   │
             │  Express + Undici     │
             └───────────┬───────────┘
                         │
        ┌────────────────┼────────────────┐
        │ (RS256 JWKS)   │                │
        ▼                ▼                ▼
┌───────────────┐┌───────────────┐┌───────────────┐
│  Auth (4001)  ││Catalog (4002) ││Booking (4003) │
│  PostgreSQL   ││   MongoDB     ││ MySQL + Redis │
└───────────────┘└───────────────┘└───────────────┘
```

---

## 2. Architectural Decisions

### Why `undici.request()` over `http-proxy-middleware`
Traditional streaming proxy middlewares like `http-proxy-middleware` hook directly into Node.js HTTP duplex streams. While suitable for basic reverse-proxying, streaming proxies conflict with circuit breaker libraries like `opossum`, which require promise-based function wrapping to inspect status codes, execution duration, and trigger states.
- In modern microservices (and particularly Ticksy), JSON payloads are modest in size (< 10MB).
- `undici.request()` yields maximum throughput, HTTP/1.1 pipelining, and precise async promise lifecycles that wrap cleanly inside `opossum.fire()`.

### Raw Body Buffering (`express.raw`)
Instead of parsing incoming JSON with `express.json()` and re-serializing it with `JSON.stringify()` on outbound proxy requests, the gateway uses:
```typescript
express.raw({ type: '*/*', limit: '10mb' })
```
**Benefits:**
1. **Zero payload mutation:** Eliminates formatting differences, key re-ordering, or precision losses on integer amounts (`priceMinor`).
2. **Webhook signature integrity:** Payment webhooks (e.g. Stripe webhook signatures) rely on computing HMAC hashes over the exact byte stream sent by the webhook provider. Re-serializing parsed JSON alters whitespace or formatting, breaking signature verification. Raw buffers guarantee byte-exact forwarding.

---

## 3. Request Processing Pipeline

Every incoming HTTP request passes through a strict, ordered middleware pipeline:

```
[1. Request ID] (X-Request-Id UUID v4 generated or propagated)
       │
[2. Request Logger] (Pino HTTP logging with requestId & latency)
       │
[3. Helmet] (Strict security headers: CSP, HSTS, Sniffing prevention)
       │
[4. CORS] (Allowed origins from CORS_ORIGINS, credentials: true)
       │
[5. Global Rate Limiter] (Window: 60s, Max: 100 req/IP, standard error envelope)
       │
[6. Route Matcher] (First-match wins regex evaluation from config/routes.ts)
       │
[7. Authenticate] (Verify Bearer JWT against Auth JWKS based on authMode)
       │
[8. Authorize] (Verify role constraints, e.g. ORGANIZER, ADMIN)
       │
[9. Forwarding / Breaker] (Undici request inside Opossum breaker + Upstream Timeout)
       │
[10. Error Mapper] (Standardized JSON error envelope: 502, 503, 504, 401, 403, 404)
```

---

## 4. Route Table & Auth Modes

The routing table is maintained declaratively in `src/config/routes.ts`. Routes are evaluated strictly in order (first match wins):

```typescript
export interface GatewayRoute {
  id: string;
  method: HttpMethod;
  pattern: RegExp;
  upstream: UpstreamService;
  authMode: AuthMode; // 'public' | 'optional' | 'required'
  allowedRoles?: UserRole[];
}
```

### Route Ordering Priority
The specific seat map route must appear **before** the generic booking route:
1. `GET /api/v1/bookings/events/:id/seats` (Auth mode: `optional`, Upstream: `booking`)
2. `ANY /api/v1/bookings/**` (Auth mode: `required`, Upstream: `booking`)

### Auth Modes
- **`public`**: No JWT required. Caller passes through anonymously. (e.g. `/api/v1/auth/login`, `/api/v1/auth/register`).
- **`optional`**: If an `Authorization: Bearer <token>` header is sent, it is strictly validated. A malformed, expired, or invalid token yields `401 UNAUTHENTICATED`. If no token is provided, the request proceeds anonymously. (e.g. `/api/v1/catalog/**`, `/graphql`, seat map).
- **`required`**: Valid RS256 JWT must be present. Missing or invalid token yields `401 UNAUTHENTICATED`.

---

## 5. Security & Header Policies

### Anti-Spoofing & Header Sanitation
To guarantee internal microservices can trust proxy headers, the gateway strips all untrusted client-supplied identity headers:
- Removes `x-user-*` and `x-forwarded-*` from incoming client headers.
- Re-injects canonical proxy headers:
  - `X-Forwarded-For`: Client remote IP address.
  - `X-Forwarded-Proto`: Client protocol (`req.protocol`).
  - `X-Request-Id`: Unified request tracing ID.
- Passes `Authorization` header directly to upstream services so they can perform fine-grained defense-in-depth verification.
- Preserves `Cookie` on requests and `Set-Cookie` on responses for Auth token refresh rotation.

---

## 6. Circuit Breaker (`opossum`) & Resilience

Each upstream service (`auth`, `catalog`, `booking`) has an independent circuit breaker instance:

### Configuration:
- **Error Threshold:** `50%` failure rate.
- **Volume Threshold:** Minimum `10` requests within the rolling window.
- **Reset Timeout:** `10,000 ms` (10 seconds) in open state before switching to half-open to probe health.
- **Upstream Timeout:** `10,000 ms` (enforced via Undici timeout signal).

### Breaker Failure Rules:
- **Failures:** Network connection failures (`ECONNREFUSED`, `ENOTFOUND`), timeouts (`504`), and upstream 5xx responses (`500`, `502`, `503`, `504`).
- **Non-failures:** Client errors (`4xx`, such as `400`, `401`, `403`, `404`, `409`) are valid domain responses and **never** count against upstream health.

### Diagnostics Endpoint:
`GET /health/upstreams` provides real-time visibility into all upstream breakers:
```json
{
  "success": true,
  "data": {
    "auth": {
      "state": "CLOSED",
      "stats": { "failures": 0, "successes": 42, "fallbacks": 0, "rejects": 0 }
    },
    "catalog": {
      "state": "OPEN",
      "stats": { "failures": 11, "successes": 2, "fallbacks": 0, "rejects": 8 }
    }
  }
}
```

---

## 7. Error Mapping Conventions

All error responses strictly adhere to the unified Ticksy error envelope:
```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "requestId": "uuid"
}
```

| Situation | HTTP Status | Code | Response Headers |
|---|---|---|---|
| Upstream unreachable / connection refused | `502` | `BAD_GATEWAY` | `X-Request-Id` |
| Upstream timeout (> 10s) | `504` | `UPSTREAM_TIMEOUT` | `X-Request-Id` |
| Circuit breaker is OPEN | `503` | `UPSTREAM_UNAVAILABLE` | `X-Request-Id`, `Retry-After: 10` |
| Missing or invalid token on protected route | `401` | `UNAUTHENTICATED` | `X-Request-Id` |
| Insufficient role on route | `403` | `FORBIDDEN` | `X-Request-Id` |
| Unmatched route | `404` | `NOT_FOUND` | `X-Request-Id` |
| Rate limit exceeded | `429` | `RATE_LIMITED` | `X-Request-Id`, `Retry-After` |
