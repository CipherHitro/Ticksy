export type UserRole = 'ATTENDEE' | 'ORGANIZER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt?: string;
}

export interface TicketTier {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  capacity: number;
  available: number;
  description?: string;
}

export interface EventItem {
  id: string;
  title: string;
  subtitle: string;
  city: string;
  venue: string;
  date: string;
  time: string;
  genre: 'music' | 'tech' | 'comedy' | 'workshop' | 'theatre';
  priceMinor: number;
  currency: string;
  availableSeats: number;
  totalSeats: number;
  posterUrl: string;
  isFeatured?: boolean;
  isDropCountdown?: boolean;
  dropTime?: string;
  tiers: TicketTier[];
  organizerId?: string;
}

export interface Seat {
  id: string;
  row: string;
  number: number;
  tierId: string;
  tierName: string;
  priceMinor: number;
  status: 'available' | 'held' | 'booked' | 'selected';
  heldByMe?: boolean;
}

export interface HoldReservation {
  holdId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  venue: string;
  seats: Seat[];
  expiresAt: string;
  totalMinor: number;
  currency: string;
}

export interface Ticket {
  id: string;
  serialNumber: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  venue: string;
  city: string;
  seats: string[];
  tierName: string;
  attendeeName: string;
  attendeeEmail: string;
  amountMinor: number;
  currency: string;
  status: 'VALID' | 'TRANSFERRED' | 'TRANSFER_PENDING' | 'REFUNDED';
  transferredTo?: string;
  purchasedAt: string;
  qrCodeValue: string;
  organizerId?: string;
  transferDetails?: {
    transferId: string;
    recipientEmail: string;
    expiresAt: string;
  };
}

export interface TicketTransferRequest {
  transferId: string;
  ticketId: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  ticketSnapshot: Ticket;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  expiresAt: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
  status: 'CREATED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';
  providerOrderId: string;
  createdAt: string;
  capturedAt?: string;
}

export interface LedgerBalance {
  organizerId: string;
  grossSalesMinor: number;
  platformFeesMinor: number;
  refundsMinor: number;
  payoutsMinor: number;
  availableBalanceMinor: number;
  currency: string;
  asOf: string;
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  type: 'TICKET_SALE' | 'PLATFORM_FEE' | 'REFUND' | 'PAYOUT';
  amountMinor: number;
  runningBalanceMinor: number;
  referenceId: string;
  description: string;
}

export interface EventSalesSummary {
  eventId: string;
  eventTitle: string;
  seatsSold: number;
  totalSeats: number;
  grossMinor: number;
}

export interface SupportMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citation?: string;
  timestamp: string;
}
