# Ticksy Auth Service — Feature Documentation

This directory contains technical architecture documents and design rationales for features and major modifications implemented in the `auth` service.

## Documentation Standard for Future Features

Whenever a new feature or architectural change is added to this service, create a new Markdown document in this directory following this structure:

1. **Overview & Problem Statement**: What was changed, what the previous approach was, and why the change was necessary (security, performance, architectural compliance).
2. **How It Works (Conceptual & Mathematical)**: Theoretical and architectural breakdown of the pattern.
3. **Architecture & Flow Diagrams**: Sequence diagram or component diagram (using Mermaid) illustrating request lifecycle and data flow.
4. **Code Implementation Summary**: Table of modified/added files and their specific responsibilities.
5. **Cross-Service Impact**: How other services (Gateway, Catalog, Booking, etc.) interact with or consume this feature.
6. **Configuration & Environment Variables**: All new/updated env vars, key generation, or setup steps.
7. **Verification & Testing**: Summary of automated unit/integration tests and how to verify locally.

---

## Documents Index

| Document | Feature | Status | Summary |
|---|---|---|---|
| [rs256-asymmetric-auth.md](./rs256-asymmetric-auth.md) | RS256 Asymmetric JWT + JWKS & Opaque Refresh Tokens | Implemented | Migrated from symmetric HS256 shared secret to RSA-2048 private/public key pairs, public JWKS endpoint (`/.well-known/jwks.json`), and opaque hashed refresh tokens in httpOnly cookies. |
