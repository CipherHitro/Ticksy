import type { EventItem, LedgerBalance, LedgerEntry, Ticket } from '../types';

export const INITIAL_EVENTS: EventItem[] = [
  {
    id: 'evt-001',
    title: 'Bangalore Open Air 2026',
    subtitle: 'India’s premier heavy metal and rock spectacle with 12 international acts',
    city: 'Bengaluru',
    venue: 'Jayamahal Palace Grounds',
    date: '2026-11-14',
    time: '16:00 IST',
    genre: 'music',
    priceMinor: 149900, // ₹1,499
    currency: 'INR',
    availableSeats: 38,
    totalSeats: 3500,
    posterUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    isFeatured: true,
    isDropCountdown: true,
    dropTime: 'Live now · Final 38 seats',
    tiers: [
      { id: 't1', name: 'General Arena', priceMinor: 149900, currency: 'INR', capacity: 2000, available: 20 },
      { id: 't2', name: 'Fan Pit (Front Row)', priceMinor: 299900, currency: 'INR', capacity: 1000, available: 12 },
      { id: 't3', name: 'VIP Lounge + Merch', priceMinor: 499900, currency: 'INR', capacity: 500, available: 6 },
    ],
  },
  {
    id: 'evt-002',
    title: 'Prateek Kuhad: Silhouettes',
    subtitle: 'An intimate, stripped-back acoustic evening under the winter sky',
    city: 'Mumbai',
    venue: 'Phoenix Marketcity Amphitheatre, Kurla',
    date: '2026-11-20',
    time: '19:30 IST',
    genre: 'music',
    priceMinor: 129900, // ₹1,299
    currency: 'INR',
    availableSeats: 114,
    totalSeats: 2200,
    posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
    tiers: [
      { id: 't1', name: 'Balcony Tier B', priceMinor: 129900, currency: 'INR', capacity: 1200, available: 80 },
      { id: 't2', name: 'Stalls Tier A', priceMinor: 219900, currency: 'INR', capacity: 800, available: 28 },
      { id: 't3', name: 'Front Reserved', priceMinor: 349900, currency: 'INR', capacity: 200, available: 6 },
    ],
  },
  {
    id: 'evt-003',
    title: 'Krunk Systems Summit 2026',
    subtitle: 'Microservices, Event Sourcing, Consensus & Chaos Engineering in Production',
    city: 'Bengaluru',
    venue: 'BIEC Convention Hall 3',
    date: '2026-12-05',
    time: '09:00 IST',
    genre: 'tech',
    priceMinor: 249900, // ₹2,499
    currency: 'INR',
    availableSeats: 82,
    totalSeats: 1500,
    posterUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    tiers: [
      { id: 't1', name: 'Standard Pass', priceMinor: 249900, currency: 'INR', capacity: 1000, available: 60 },
      { id: 't2', name: 'Full Conference + Workshop', priceMinor: 499900, currency: 'INR', capacity: 500, available: 22 },
    ],
  },
  {
    id: 'evt-004',
    title: 'Zakir Khan: Live Special',
    subtitle: 'Brand-new 90-minute stand-up solo. Strictly 18+.',
    city: 'Delhi',
    venue: 'Sirifort Auditorium, August Kranti Marg',
    date: '2026-11-28',
    time: '20:00 IST',
    genre: 'comedy',
    priceMinor: 79900, // ₹799
    currency: 'INR',
    availableSeats: 45,
    totalSeats: 1800,
    posterUrl: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=1200&q=80',
    tiers: [
      { id: 't1', name: 'Balcony', priceMinor: 79900, currency: 'INR', capacity: 800, available: 25 },
      { id: 't2', name: 'Silver Stalls', priceMinor: 149900, currency: 'INR', capacity: 700, available: 15 },
      { id: 't3', name: 'Gold Front Row', priceMinor: 249900, currency: 'INR', capacity: 300, available: 5 },
    ],
  },
  {
    id: 'evt-005',
    title: 'Sunburn Arena ft. Boris Brejcha',
    subtitle: 'High-tech minimal maestro returns to Mumbai for an exclusive sunset session',
    city: 'Mumbai',
    venue: 'Mahalaxmi Racecourse Arena',
    date: '2026-12-12',
    time: '17:00 IST',
    genre: 'music',
    priceMinor: 199900, // ₹1,999
    currency: 'INR',
    availableSeats: 260,
    totalSeats: 6000,
    posterUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    tiers: [
      { id: 't1', name: 'General Access', priceMinor: 199900, currency: 'INR', capacity: 4500, available: 200 },
      { id: 't2', name: 'VIP Elevated Deck', priceMinor: 399900, currency: 'INR', capacity: 1500, available: 60 },
    ],
  },
  {
    id: 'evt-006',
    title: 'Gaurav Kapoor: Vaisi Baat Nahi Hai',
    subtitle: 'Unfiltered crowd work and observational comedy in Ahmedabad',
    city: 'Ahmedabad',
    venue: 'Pandit Dindayal Upadhyay Auditorium, Bodakdev',
    date: '2026-12-18',
    time: '19:00 IST',
    genre: 'comedy',
    priceMinor: 69900, // ₹699
    currency: 'INR',
    availableSeats: 64,
    totalSeats: 900,
    posterUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    tiers: [
      { id: 't1', name: 'Standard Seat', priceMinor: 69900, currency: 'INR', capacity: 600, available: 45 },
      { id: 't2', name: 'Premium Row 1-5', priceMinor: 129900, currency: 'INR', capacity: 300, available: 19 },
    ],
  },
];

export const PROOF_METRICS = [
  { value: '14,200', label: 'SEATS CHECKED / SEC', note: 'k6 load test · 0 double-bookings' },
  { value: '0', label: 'OVERSOLD SEATS', note: 'Redis distributed lock + MySQL row lock' },
  { value: '42ms', label: 'P95 BOOKING TIME', note: 'End-to-end hold & saga confirm' },
  { value: '< 1m', label: 'PAYOUT VISIBILITY', note: 'Immutable KurrentDB event projection' },
];

export const INITIAL_LEDGER_BALANCE: LedgerBalance = {
  organizerId: 'org-curator-mumbai',
  grossSalesMinor: 14250000, // ₹1,42,500
  platformFeesMinor: 712500,  // ₹7,125 (5%)
  refundsMinor: 240000,      // ₹2,400
  payoutsMinor: 4000000,     // ₹40,000
  availableBalanceMinor: 9297500, // ₹92,975
  currency: 'INR',
  asOf: new Date().toISOString(),
};

export const INITIAL_LEDGER_ENTRIES: LedgerEntry[] = [
  {
    id: 'led-001',
    timestamp: '18:12:04 IST',
    type: 'TICKET_SALE',
    amountMinor: 240000,
    runningBalanceMinor: 13537500,
    referenceId: 'TKS-8821-X09',
    description: 'Ticket sale (2 seats · Fan Pit)',
  },
  {
    id: 'led-002',
    timestamp: '18:12:05 IST',
    type: 'PLATFORM_FEE',
    amountMinor: -12000,
    runningBalanceMinor: 13525500,
    referenceId: 'FEE-8821',
    description: 'Platform fee 5%',
  },
  {
    id: 'led-003',
    timestamp: '17:58:21 IST',
    type: 'REFUND',
    amountMinor: -120000,
    runningBalanceMinor: 13537500,
    referenceId: 'REF-0491',
    description: 'Attendee refund (Seat B-14)',
  },
  {
    id: 'led-004',
    timestamp: '16:30:00 IST',
    type: 'PAYOUT',
    amountMinor: -4000000,
    runningBalanceMinor: 13657500,
    referenceId: 'PO-2026-091',
    description: 'Automated bank payout (HDFC Bank ...8812)',
  },
  {
    id: 'led-005',
    timestamp: '15:45:12 IST',
    type: 'TICKET_SALE',
    amountMinor: 380000,
    runningBalanceMinor: 17657500,
    referenceId: 'TKS-4412-C02',
    description: 'Ticket sale (1 VIP Lounge)',
  },
];

export const INITIAL_MY_TICKETS: Ticket[] = [
  {
    id: 'tkt-001',
    serialNumber: 'TKS-8821-X09',
    eventId: 'evt-001',
    eventTitle: 'Bangalore Open Air 2026',
    eventDate: '2026-11-14 · 16:00 IST',
    venue: 'Jayamahal Palace Grounds',
    city: 'Bengaluru',
    seats: ['F-12', 'F-13'],
    tierName: 'Fan Pit (Front Row)',
    attendeeName: 'Rohit Rathod',
    attendeeEmail: 'rohit@ticksy.local',
    amountMinor: 299900,
    currency: 'INR',
    status: 'VALID',
    purchasedAt: '2026-10-21T17:42:00Z',
    qrCodeValue: 'ticksy:tkt-001:TKS-8821-X09:sha256-verified',
  },
];

export const FAQ_ITEMS = [
  {
    question: 'How does the 8-minute seat hold guarantee zero double-bookings?',
    answer: 'When you select a seat, Ticksy acquires a distributed lock in Redis for exactly 480 seconds (8 minutes) before the order enters MySQL. If your checkout session expires or you close the browser, the lock dissolves automatically and the seat becomes available to the next fan in queue.',
  },
  {
    question: 'Can I get a refund if I cannot attend the event?',
    answer: 'Yes. Attendees can request a 1-tap refund up to 48 hours before doors open directly from the "My Tickets" tab. The system initiates an administrative refund via Razorpay, revokes the QR ticket stub, and automatically reflects the deduction in the organizer’s append-only ledger.',
  },
  {
    question: 'What is the flash-sale waiting room?',
    answer: 'For high-demand drops, incoming traffic is metered by a token bucket queue. Fans receive a deterministic position in line (e.g. #1,284) and are admitted in batches of 250 as seats are held or released. This prevents database starvation and eliminates scalper bot races.',
  },
  {
    question: 'How are organizer payouts calculated and audited?',
    answer: 'Ticksy’s Ledger Service runs on event sourcing with KurrentDB and CQRS. Every ticket sale, 5% platform fee, attendee refund, and bank payout is recorded as an immutable event. No row can ever be modified or deleted; corrections are handled via explicit reversals.',
  },
  {
    question: 'What payment methods are supported?',
    answer: 'Ticksy supports all Indian payment methods via Razorpay: UPI (Google Pay, PhonePe, Paytm, Cred), Debit/Credit Cards (RuPay, Visa, Mastercard), and Netbanking across all major Indian banks.',
  },
];
