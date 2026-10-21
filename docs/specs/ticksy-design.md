# Ticksy: landing page and frontend design brief

Oct 21, 2026 · @Rohit Rathod

Ticksy should look like a printed ticket stub crossed with a bank statement: warm ink-black and bone paper, one ember accent, large editorial serif type, monospaced numbers and no gradients at all. Give this whole document to your AI tool as the design source of truth, then build one section at a time.

## Design direction

The one idea is **ticket stub meets ledger**. Every visual detail should come from one of two objects: a physical ticket (perforated edge, serial number, big event name, QR) or a financial statement (hairline rules, right-aligned monospaced numbers, running balance). Nothing else is allowed to decorate the page, and that is what stops it looking like a template.

| Token | Value | Where it goes |
| --- | --- | --- |
| Ink | `#0B0A08` | Main dark background. Warm black, never pure `#000` and never navy. |
| Bone | `#EDE8DD` | Light sections and body text on dark. Reads as paper. |
| Ember | `#FF4F1F` | The only accent: primary buttons, live indicators, held seats. Use it on less than 5% of any screen. |
| Brass | `#B8975A` | Ledger and organizer areas only. Gives money a calmer, premium tone. |
| Hairline | Bone at 12% opacity | All borders. 1px, never a drop shadow. |
| Display font | Instrument Serif | Headlines, event titles, huge numerals. Sizes of 72 to 160px on desktop. |
| Body font | Geist | Paragraphs, buttons, forms. |
| Mono font | Geist Mono | Prices, seat IDs, ticket serials, ledger rows. Use tabular numbers so columns line up. |
| Radius | 2 to 4px | Cards, buttons, inputs. No 24px pill-cards. |
| Currency | ₹ first | Show ₹ everywhere by default and use Indian digit grouping, such as ₹1,24,500. |

**Signature details to repeat across the whole site**

- **Notched edges.** Event cards and tickets have semicircle cutouts on the sides, like a torn stub, made with CSS masks.
- **Serial numbers.** Small mono labels such as `TKS-0042-C14` sit in corners of cards and sections as quiet texture.
- **Live seat grid.** A field of tiny dots representing seats appears in the hero and returns in the footer. This is the brand mark in motion.
- **Light and dark alternation.** Hero is Ink, event drops are Bone, the waiting room story is Ink, the ledger section is Bone, the final CTA is Ink. The rhythm is what feels expensive.
- **Subtle paper grain.** A 3 to 4% noise overlay on dark sections so they don't feel flat.
- **Motion rules.** Ease-out curves, 300 to 600ms, one thing moving at a time. Nothing bounces or floats endlessly.

## Which tool to use where

The four sites do different jobs, and most sites look generic because people use the flashy ones for everything. Use [Mobbin](https://mobbin.com/) before you build, [21st.dev](https://21st.dev/) for the dull but important parts, [React Bits](https://reactbits.dev/) for small details, and [Aceternity](https://ui.aceternity.com/) for one or two big moments. Component names change as these libraries grow, so check each site's current catalog before telling your AI a name.

| Tool | What it is good for | Use it on Ticksy for | Do not use it for |
| --- | --- | --- | --- |
| Mobbin | Screenshots of real app flows, to copy structure and not style | Reference before building: seat selection, checkout, OTP login, organizer dashboards, payout statements. Search apps like Ticketmaster, BookMyShow, Eventbrite, Luma, DICE, Airbnb, Stripe, Mercury and Linear. | Copying anyone's visuals. Take the flow and spacing, replace the look. |
| 21st.dev | Clean, shadcn-based building blocks you can restyle | Auth forms, OTP input, navbar, FAQ accordion, data tables, command palette, dialogs, toasts, footer, pricing or fee table | Hero sections and anything meant to be memorable. Their default styling is the generic look you are avoiding, so always re-skin with the tokens above. |
| React Bits | Small animated text effects, backgrounds and cursor details | Split or blur text on the hero headline, count-up numbers, dot-grid background (seat field), spotlight hover on cards, magnetic buttons, tilted ticket card | Gradient text, aurora or blob backgrounds, anything that loops forever in the corner of the screen. |
| Aceternity UI | Large, scroll-driven, showpiece sections | Sticky scroll reveal for the waiting-room story, floating navbar, bento grid for organizer features, infinite moving cards for the ticker | Using more than two of its effects on one page. Overuse is exactly what makes a site look AI-generated. |

**The effects budget.** Across the entire landing page, allow at most four showy effects: hero text reveal, the live seat grid, one scroll-driven story section, and one tilted ticket. Everything else stays still and typographic. Restraint is what separates premium from busy.

## Landing page, section by section

The page has 11 sections and tells one story: fans get a fair, fast booking, and organizers get a payout record they can trust. The sections alternate between Ink and Bone backgrounds.

### 1. Navigation (Ink)

A thin bar fixed to the top with a hairline bottom border. Left: the **Ticksy** wordmark in Instrument Serif with a small notch cut into the T. Centre: Events, Organizers, How it works, Help. Right: a quiet Sign in text link and an Ember button, Get tickets. After scrolling past the hero it collapses into a compact floating pill. Source: Aceternity floating navbar as the behavior, restyled with the tokens above.

### 2. Hero (Ink)

- **Headline:** huge serif, left-aligned, three lines: *Every seat. Every rupee. Accounted for.* The word *Accounted* is italic.
- **Subline:** one sentence in Geist, bone at 70%: Live events with a fair queue for fans and a ledger you can audit for organizers.
- **Buttons:** Ember primary, Browse events. Outline secondary, I'm an organizer.
- **Right side:** the live seat grid, about 600 small dots in a stadium or theatre shape. Every second or so one dot flips to Ember, as if a seat was just booked, and a tiny mono label fades beside it, such as `C14 held · 07:59`. On hover the dots near the cursor lift slightly.
- **Bottom edge:** a slow ticker of real-looking event names with mono timestamps, such as `SOLD  B6–B8  ·  Indie Night, Ahmedabad`.
- **Source:** React Bits split-text for the headline reveal and dot-grid as the starting point for the seat field. Build the seat shape yourself in SVG or canvas so it is unique.

### 3. Proof strip (Bone)

One row of four large serif numerals with mono captions: seats checked per second, oversold seats, p95 booking time, minutes to payout visibility. **Use real numbers from your own load tests** (for example, a k6 run with 5,000 virtual users and zero double-bookings). Recruiters trust one measured number more than ten invented ones. Source: React Bits count-up.

### 4. This week's drops (Bone)

A heading in serif, filter chips for city and genre, then a grid of **poster-first event cards**. Each card is a 4:5 poster with notched edges, event title in serif below, date and venue in mono, a price in `from ₹799` form and a small Ember tag such as `38 left` when stock is low. On hover the poster zooms 3% and the tag turns solid. The first card in the grid is double-width and shows a countdown to its on-sale time. Source: 21st.dev card or grid as the base, React Bits spotlight hover as the only effect. Posters should be real photography with a film-grain treatment; never use gradient placeholders.

### 5. The 7 PM rush: waiting room and seat hold (Ink)

The signature story section, built as a scroll-driven sticky layout. Left column: four steps in serif with short captions. Right column: a visual that changes with each step.

1. **Join the queue.** Shows your position and estimated wait in mono numerals, for example `You are #1,284 · about 3 min`.
2. **Pick your seats.** A small seat map where seats others are viewing pulse softly.
3. **Hold for 8 minutes.** A thin Ember countdown ring around the selected seats.
4. **Pay and receive.** The ticket stub slides out with its QR.

This section quietly explains your waiting room, seat lock and saga work without a single technical word. Source: Aceternity sticky scroll reveal, restyled.

### 6. Try a seat (Bone)

A small, **fully interactive** seat map, about 8 rows by 12 seats, that visitors can click right on the landing page. Clicking a seat holds it with an Ember outline, starts an 8:00 countdown and shows a price summary beside it. A mono line below reads `212 people are viewing this event`. This is the most memorable moment on the page, and it demonstrates the real product. Use Motion for the transitions. Do not use any library here.

### 7. Your ticket (Ink)

One large ticket, centred, drawn as a real stub: event name in serif, a perforated vertical divider, mono serial, QR code on the right. It tilts slightly toward the cursor. Beside it, three short lines about instant delivery, transfer to a friend and one-tap refund requests. Source: React Bits tilted card as the interaction, but design the ticket yourself.

### 8. For organizers: the ledger (Bone, with Brass accents)

This is the section that sets Ticksy apart.

- **Left:** headline *A payout record nobody can edit.* and two sentences about every sale, fee, refund and payout being its own entry.
- **Right:** a live-looking statement table in Geist Mono. Columns: time, entry, amount, balance. New rows slide in at the bottom every few seconds, such as `Ticket sale  +₹2,400`, `Platform fee  −₹120`, `Refund  −₹1,200`, `Payout  −₹40,000`. Amounts are right-aligned, negatives in Ember and the running balance in Brass.
- **Below the table:** a 3-card bento row with Real-time sales, Refunds handled automatically and Payout schedule. Hairline borders, no icons in coloured squares.
- **Source:** 21st.dev data table as the base for the ledger, Aceternity bento grid for the layout only.

### 9. Ask Ticksy: support that cites its sources (Ink)

A mock chat panel showing a real RAG answer. User: *Can I get a refund if I can't attend?* Reply: two short sentences, followed by a small mono citation chip, `Refund policy · §3.2`. The chip is visually the hero of this section because it shows the answer is grounded in your own documents. Source: 21st.dev chat or input component, restyled.

### 10. FAQ (Bone)

A two-column layout: serif heading on the left, accordion on the right with hairline separators. Five questions: refunds, transferring a ticket, waiting room, payment safety, payout timing. Source: 21st.dev accordion.

### 11. Final call and footer (Ink)

A giant serif line, *Your seat is waiting.*, with a single Ember button. Under it, the seat-grid dots return, now almost all lit. The footer has four quiet link columns, a mono line with the version and status, and a huge cropped **Ticksy** wordmark bleeding off the bottom edge of the page.

## Authentication

Auth should feel like handing over a ticket at a gate: short, calm and one step at a time. Use a split screen: the form takes the left 45% on Bone, and the right 55% is Ink with the seat-grid field and one oversized ticket stub, so it feels like the same product as the landing page.

**Flow**

1. **Email first.** One field, Continue with email, and a Continue with Google button below a hairline *or* divider. No password field on the first screen.
2. **Six-digit code.** Six separate mono boxes, auto-advance, paste support and a quiet Resend in 30s link. Source: 21st.dev OTP input, restyled.
3. **Name and city (new users only).** Two fields, then straight into the app.
4. **Optional password** can be added later in settings. Magic code is the default because it removes forgotten-password support work.

**Details that make it feel premium**

- Inputs have a 1px hairline border that turns Ember on focus, with the label sitting above in small mono capitals.
- Errors appear inline under the field in plain language, such as *That code has expired. Send a new one.* No red banners and no shake animations.
- The right panel shows a different event poster on each visit, with the caption in mono, for example `Next drop · Fri 7 PM`.
- Buttons show a thin progress line along the bottom edge while loading, instead of a spinner.

**Organizer sign-up** is a separate, slower three-step flow with a progress rail down the left in mono numerals (`01 Account`, `02 Business`, `03 Payouts`). Step 3 connects Stripe in test mode and shows a clear note on how the ledger and payouts work. Visually it uses Brass accents in place of Ember, so people know they are in the business side.

**Mobbin searches** for reference: OTP login, passwordless sign-in, onboarding progress, split-screen auth. Compare Linear, Cash App and Airbnb, then keep the structure and drop the styling.

**Pages to design:** `/login`, `/verify`, `/welcome`, `/organizer/apply`, `/organizer/onboarding`.

## The other screens

Design these after the landing page and auth are approved. Each one maps directly to a backend feature, so the interface also proves the architecture.

| Screen | What it must show | Design note | Backend it proves |
| --- | --- | --- | --- |
| Event detail | Large poster, date and venue in mono, price tiers, a sticky Get tickets bar | Editorial layout, poster on the left and details scrolling on the right | Catalog and search, CDN |
| Waiting room | Position in queue, estimated wait, a calm progress line | Almost empty screen, one huge mono number. Calm is the point. | Virtual queue, rate limiting |
| Seat selection | Seat map, price tiers, an 8:00 hold countdown, live viewer count | Map on Bone, held seats Ember, unavailable seats hairline outline. Mobile uses a zoomable map with a bottom sheet. | Redis locks, inventory service |
| Checkout | Order summary, Stripe payment form, hold timer pinned at top | Two columns, the summary styled as a receipt with dashed rules | Saga, payment webhooks, idempotency |
| Confirmation and My tickets | Ticket stub with QR, add to wallet, transfer, request refund | The same ticket component as the landing page | Notifications, PDF and QR, S3 |
| Organizer dashboard | Sales over time, seats sold, next payout, scan-in rate | Dense but calm: hairline cards, one chart line in Ember, a mono number grid | CQRS read models |
| Ledger | Statement of every entry with filters, balance, export | Brass accents, right-aligned mono columns, no row can be edited, only reversed by a new entry | Event sourcing |
| Refund flow | Reason, amount, status timeline | Vertical timeline with one Ember dot for the current step | Saga compensation |
| Support chat | Chat with cited policy answers and a human handoff | Same citation chip as the landing page | RAG |

Mobbin is most useful for this table. Before building each screen, search the matching flow (seat selection, checkout, dashboard, transactions list), save five references and tell your AI which structural ideas to borrow.

## The ban list

AI tools fall back to the same habits every time. Paste this list into every prompt so they are ruled out in advance.

| Do not do this | Do this instead |
| --- | --- |
| Blue, purple or pink gradients, glowing blobs, aurora backgrounds | Flat Ink and Bone with one Ember accent and a faint grain overlay |
| Glassmorphism cards with blur everywhere | Opaque surfaces with 1px hairline borders |
| Inter or Space Grotesk for everything | Instrument Serif, Geist and Geist Mono as specified above |
| Three identical feature cards, each with an icon in a coloured square | One strong visual per section, with text beside it and no icon boxes |
| Everything centred, with a centred hero and centred paragraphs | Left-aligned text on a visible 12-column grid, with deliberate empty space |
| Large rounded corners (16 to 28px) and soft drop shadows | 2 to 4px radius, no shadows, depth from borders and background contrast |
| "Trusted by" rows with fake company logos | Real measured numbers from your own load tests, or nothing |
| Words like Unleash, Elevate, Seamless, Revolutionize | Plain sentences with specifics: *8-minute hold*, *₹ amounts*, *zero oversells* |
| Emoji as icons | A single thin-stroke icon set, used sparingly, or no icon at all |
| Stock illustrations and placeholder gradients for posters | Real photography with grain, or typographic posters made from the title alone |
| Infinite floating, bouncing or pulsing animations | One purposeful motion at a time, 300 to 600ms, ease-out |
| Lorem ipsum and "John Doe" | Believable Indian event names, venues, cities and ₹ prices |

## Master prompt

Paste this once at the start of a new chat with your AI coding tool, together with this document. Then give it one section at a time, using the build order below.

```
You are a senior product designer and frontend engineer. We are building the
frontend for Ticksy, a live-event ticketing platform with a flash-sale waiting
room, seat holds and an append-only organizer payout ledger.

Stack: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui primitives,
Motion for animation, next/font for fonts. Mobile-first and responsive.

Design direction: ticket stub meets bank statement. Follow the attached brief
exactly for palette (Ink #0B0A08, Bone #EDE8DD, Ember #FF4F1F, Brass #B8975A),
fonts (Instrument Serif, Geist, Geist Mono), radius (2 to 4px), 1px hairline
borders and the alternating Ink/Bone section rhythm. Put all of these in
Tailwind theme tokens first, and never hard-code colours in components.

Hard rules:
- No gradients of any kind. No glassmorphism. No drop shadows.
- No centred-everything layouts. Use a 12-column grid with left-aligned text.
- No three-identical-cards-with-icons sections.
- No emoji, no lorem ipsum, no fake company logos.
- Maximum four showy animations on the whole landing page.
- Copy must be plain and specific. Never write Unleash, Elevate or Seamless.
- Use Indian rupee formatting and believable Indian events and venues.
- Prices, seat IDs and ledger rows use Geist Mono with tabular numbers.

When using components from 21st.dev, Aceternity UI or React Bits, take only the
behavior and re-skin them completely with our tokens. Do not keep their default
colours, radii or gradients.

Build only the section I name in each message. After building it, list what you
chose and why, then wait for feedback. Check it at 390px, 768px and 1440px
widths, and make sure focus states, contrast and prefers-reduced-motion are
handled.
```

## Build order

If you ask an AI for the whole page in one go, you get the generic version. Ask for one piece at a time, review a screenshot after each, and correct it before moving on.

1. **Foundation.** Tailwind tokens, fonts, grain overlay, the notched-edge utility and the base button, input and card styles. Review before anything else.
2. **Navigation and hero** with the live seat grid. This sets the quality bar for the rest, so iterate here until you are happy.
3. **Event drops grid** with the poster card component.
4. **Try a seat.** The interactive seat map and its countdown, built by hand.
5. **Waiting-room story** (sticky scroll section) and the ticket section.
6. **Ledger section**, proof strip, Ask Ticksy, FAQ, final call and footer.
7. **Auth screens**, then the remaining screens from the table above in the order a customer meets them.
8. **Polish pass.** Check mobile at 390px, keyboard focus, colour contrast, reduced motion, and page weight (compress posters, lazy-load below the fold).

**How to correct the AI.** When something looks generic, don't say "make it more premium". Name the specific fault and the fix, for example: *Cards have 16px radius and a shadow, change to 2px radius with a hairline border. The headline is centred, left-align it on the grid.* Specific feedback gets specific changes.

The component names in this brief come from my general knowledge of these libraries and were not checked against their current catalogs, so confirm each one exists before you rely on it.
