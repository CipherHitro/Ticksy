# Ticksy — Frontend Application

Modern, high-conviction frontend for **Ticksy**, the live-event ticketing platform featuring flash-sale waiting rooms, distributed seat holds, and append-only organizer payout ledgers.

- **Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **Design Specification:** [`docs/specs/ticksy-design.md`](../docs/specs/ticksy-design.md)
- **API Entrypoint:** Proxy to API Gateway (`http://localhost:8080`)

---

## 🎨 Design System & Philosophy

Built on the concept of **"Ticket Stub Meets Bank Statement"**:

| Token | Hex | Role |
|---|---|---|
| **Ink** | `#0B0A08` | Primary dark background. Warm black, never pure `#000`. |
| **Bone** | `#EDE8DD` | Paper tone for alternating sections, cards, and body text on dark. |
| **Ember** | `#FF4F1F` | The only accent: primary actions, live indicators, held seats (<5% of screen). |
| **Brass** | `#B8975A` | Organizer balance, ledger statements, and financial highlights. |
| **Hairline** | `rgba(237, 232, 221, 0.12)` | 1px crisp borders, zero heavy drop shadows or glassmorphism. |

### Typography
- **Display Serif:** `Instrument Serif` (Headlines, event titles, huge editorial numerals).
- **Body Sans:** `Geist` (Paragraphs, forms, buttons).
- **Data Mono:** `Geist Mono` (Seat IDs, prices, serial numbers, ledger tabular numbers).

---

## 🏗️ Architecture & Backend Integrations

The frontend directly connects and proves the course microservices architecture:

1. **Auth Service (`/api/v1/auth`)**:
   - RS256 asymmetric JWT verification via JWKS (`/.well-known/jwks.json`).
   - Split-screen auth with email/password, 6-digit OTP, and 1-click test role switchers (`ATTENDEE`, `ORGANIZER`, `ADMIN`).
2. **Booking & Inventory Service (`/api/v1/bookings`)**:
   - Interactive 8x12 seat map in "Try a Seat" section.
   - 8-minute distributed seat hold with real-time countdown ring and live viewer metric.
3. **Payment Service (`/api/v1/payments`)**:
   - Receipt-styled checkout summary with dashed tear rules.
   - Razorpay payment simulation & client verification (`POST /api/v1/payments/{id}/verify`).
4. **Ledger Service (`/api/v1/ledger`)**:
   - Live sliding event-sourced statement table in Geist Mono.
   - Balance cards in Brass showing available balance, gross sales, and 5% platform fees.
   - Payout requests with `Idempotency-Key` header.
   - Dev Event Injector (`POST /api/v1/ledger/dev/events`) to test live CQRS projections.
5. **Support RAG Service**:
   - Interactive chat citing grounded bylaws and specs with mono citation chips (`Refund policy · §3.2`).

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Start development server (Port 5173 with proxy to gateway on 8080)
npm run dev

# Run Oxlint
npm run lint

# Compile and typecheck production build
npm run build
```
