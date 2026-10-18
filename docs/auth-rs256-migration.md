# Auth Service: RS256 Asymmetric Key (JWKS) Migration

> This document explains why and how Ticksy transitioned from symmetric shared secret tokens (HS256) to asymmetric RSA key pairs (RS256) with JWKS public key distribution.

---

## 1. Why the Change?

### The Problem with Symmetric Signing (HS256)
In symmetric signing (like HS256), a single shared secret is used to **both sign and verify** tokens:
- **Major Security Risk:** If every downstream microservice (Gateway, Catalog, Booking, Payment, Ledger, etc.) needs to verify user tokens, every service must have a copy of the secret. If *any single service* is compromised, an attacker can use that shared secret to forge arbitrary tokens (e.g., mint an admin token for any user).
- **Configuration Overhead:** Secret rotation requires updating every service simultaneously without downtime.

### The Solution: Asymmetric Signing (RS256) with JWKS
With RS256:
1. **Private Key (Signing):** Kept strictly inside the **Auth Service**. No other service ever sees or touches this key.
2. **Public Key (Verification):** Distributed openly via a JSON Web Key Set (JWKS) endpoint (`/.well-known/jwks.json`).
3. **Impossibility of Forgery:** Downstream services and gateways can verify the signature of any token with 100% mathematical certainty using the public key, but they cannot forge tokens because forging requires the private key.

---

## 2. Key Generation & Management

In local development, RSA keys are generated under `services/auth/keys/` (which is git-ignored):
```bash
mkdir -p services/auth/keys
openssl genrsa -out services/auth/keys/private.pem 2048
openssl rsa -in services/auth/keys/private.pem -pubout -out services/auth/keys/public.pem
```

Environment variables configured on Auth:
```bash
JWT_PRIVATE_KEY_PATH=keys/private.pem
JWT_PUBLIC_KEY_PATH=keys/public.pem
JWT_KEY_ID=ticksy-auth-2026-v1
JWT_ISSUER=ticksy-auth
JWT_AUDIENCE=ticksy-api
```

---

## 3. Endpoints Added

### 1. `GET /.well-known/jwks.json`
- **Access:** Public (internal service network).
- **Caching:** `Cache-Control: public, max-age=300`. Services cache the public key for at least 5 minutes and only refetch if they see a token signed with an unknown `kid` (key ID).
- **Shape:**
  ```json
  {
    "keys": [
      {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": "ticksy-auth-2026-v1",
        "n": "...",
        "e": "AQAB"
      }
    ]
  }
  ```

### 2. `GET /.well-known/openid-configuration`
- **Access:** Public.
- **Purpose:** Minimal OIDC discovery document so frameworks like .NET's `JwtBearer` can automatically discover and rotate JWKS keys via `MetadataAddress` without writing custom key resolver code.
- **Shape:**
  ```json
  {
    "issuer": "ticksy-auth",
    "jwks_uri": "http://localhost:4001/.well-known/jwks.json"
  }
  ```

---

## 4. How Downstream Services Verify Tokens

| Stack | Library Used | Verification Mechanism |
|---|---|---|
| **TypeScript / Gateway** | `jose` | Uses `createRemoteJWKSet(new URL(env.AUTH_JWKS_URL))` with an explicit `algorithms: ['RS256']` allowlist. |
| **.NET / Payment** | `Microsoft.AspNetCore.Authentication.JwtBearer` | Points `opts.MetadataAddress` to `http://localhost:4001/.well-known/openid-configuration`, sets `ValidAlgorithms = ["RS256"]`. |
| **Python / Catalog** | `PyJWT` | Uses `PyJWKClient(AUTH_JWKS_URL)` to fetch and cache signing keys. |
| **Java / Booking** | `Spring Security OAuth2 Resource Server` | Uses `spring.security.oauth2.resourceserver.jwt.jwk-set-uri`. |
