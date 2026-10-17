# Ticksy Auth Service

The identity, authentication, and session management microservice for Ticksy.

- **Stack:** Node.js (v22), TypeScript (ESM), Express, Prisma ORM
- **Database:** PostgreSQL (`ticksy_auth`)
- **Port:** `4001`
- **Owner:** CipherHitro
- **Public URL Prefix:** `/api/v1/auth`

---

## Architecture & Features

- **Asymmetric RS256 Authentication:** Signs access tokens with a private RSA key. Exposes public verification keys via standard JWKS (`GET /.well-known/jwks.json`).
- **Opaque Refresh Tokens:** Cryptographically random 32-byte tokens stored as SHA-256 hashes in PostgreSQL; served via `httpOnly`, `SameSite=Strict`, `Secure` cookies.
- **Defense in Depth:** Rate-limited login endpoints, constant-time dummy password verification on missing users, uniform JSON error shapes (`{ success, code, message, requestId }`).
- **Feature Documentation:** Detailed architectural specifications live in [`docs/`](./docs/README.md).
  - [RS256 Migration & JWKS Architecture](./docs/rs256-asymmetric-auth.md)

---

## Prerequisites

- Node.js >= 20.x (Recommended: Node 22)
- OpenSSL (to generate local dev keypair)
- PostgreSQL (or run `docker compose -f infra/docker/docker-compose.infra.yml --profile auth up -d`)

---

## Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | HTTP port | `4001` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |
| `LOG_LEVEL` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) | `info` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://auth_user:auth_pass@localhost:5433/ticksy_auth?schema=public` |
| `JWT_PRIVATE_KEY_PATH` | Path to RSA private key PEM file | `./keys/private.pem` |
| `JWT_PUBLIC_KEY_PATH` | Path to RSA public key PEM file | `./keys/public.pem` |
| `JWT_KEY_ID` | Key identifier included in token header and JWKS | `ticksy-auth-key-1` |
| `JWT_ISSUER` | Expected JWT issuer (`iss`) | `ticksy-auth` |
| `JWT_AUDIENCE` | Expected JWT audience (`aud`) | `ticksy-api` |
| `SEED_ADMIN_EMAIL` | Initial admin user email for seeding | `admin@ticksy.local` |
| `SEED_ADMIN_PASSWORD` | Initial admin user password for seeding | `AdminPass123!` |
| `SEED_ADMIN_NAME` | Initial admin display name | `Ticksy Administrator` |

---

## Local Development Setup

### 1. Generate RSA Keys (Git-Ignored)
```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
chmod 600 keys/private.pem
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Database & Migrations
```bash
# Start Postgres container
docker compose -f ../../infra/docker/docker-compose.infra.yml --profile auth up -d

# Run Prisma migrations & seed admin user
npx prisma migrate dev
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts server in watch mode via `tsx` |
| `npm run build` | Compiles TypeScript to `dist/` |
| `npm start` | Runs compiled code in production mode |
| `npm run typecheck` | Validates TypeScript types (`tsc --noEmit`) |
| `npm test` | Runs unit and integration tests via `vitest` |
| `npm run seed` | Seeds the initial admin user using `prisma/seed.ts` |

---

## API Endpoints

### Public & Auth Routes (`/api/v1/auth`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Register a new attendee or organizer | No |
| `POST` | `/api/v1/auth/login` | Login with email and password | No (Rate-limited) |
| `POST` | `/api/v1/auth/refresh` | Rotate access token using `refreshToken` cookie | Cookie |
| `POST` | `/api/v1/auth/logout` | Revoke current refresh token and clear cookie | Cookie |
| `GET` | `/api/v1/auth/me` | Get current authenticated user profile | Bearer Token |

### Internal / Platform Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/.well-known/jwks.json` | Public JWKS endpoint exposing public verification keys |
| `GET` | `/health/live` | Liveness probe (HTTP 200 if process is up) |
| `GET` | `/health/ready` | Readiness probe (Verifies PostgreSQL connection) |
