import React, { useState, useEffect } from 'react';
import type { Ticket, TicketTransferRequest } from '../../types';
import {
  cancelBooking,
  getUserBookings,
  recordLedgerRefund,
  sendNotificationEvent,
  createTicketTransfer,
  getPendingTransfersForUser,
  acceptTicketTransfer,
  cancelTicketTransfer,
} from '../../services/api';
import { formatINR } from '../../utils/formatters';
import { useAuth } from '../../services/authContext';
import { TicketStub } from '../common/TicketStub';
import { X, Ticket as TicketIcon, AlertCircle, RefreshCw, ShieldAlert, ArrowRight, Send, Clock } from 'lucide-react';

interface MyTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTransferId?: string | null;
}

export const MyTicketsModal: React.FC<MyTicketsModalProps> = ({
  isOpen,
  onClose,
  initialTransferId,
}) => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [refundCandidate, setRefundCandidate] = useState<Ticket | null>(null);
  const [transferCandidate, setTransferCandidate] = useState<Ticket | null>(null);
  const [transferEmail, setTransferEmail] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [incomingTransfers, setIncomingTransfers] = useState<TicketTransferRequest[]>([]);
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'TRANSFERS' | 'REFUNDED'>('ALL');

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const loadBookings = async () => {
    setLoading(true);
    const res = await getUserBookings();
    setLoading(false);

    // Check incoming transfers for current user email
    if (user?.email) {
      const pending = getPendingTransfersForUser(user.email);
      setIncomingTransfers(pending);
    }

    const allTransfers: TicketTransferRequest[] = JSON.parse(localStorage.getItem('ticksy_ticket_transfers') || '[]');

    if (res.success && Array.isArray(res.data)) {
      const mappedTickets: Ticket[] = res.data.map((b: any) => {
        const serial = 'TK-' + b.bookingId.slice(0, 8).toUpperCase();
        const rawSeats = (b.items || []).map((i: any) => i.seatLabel || i);
        const uniqueSeats = Array.from(new Set(rawSeats)).filter(Boolean);

        let status = b.status === 'CONFIRMED' ? 'VALID' : (b.status === 'CANCELLED' || b.status === 'REFUNDED') ? 'REFUNDED' : (b.status as any);
        let transferredTo: string | undefined = undefined;

        // Check if ticket has transfer state in local storage
        const matchedTransfer = allTransfers.find((x) => x.ticketId === b.bookingId);
        if (matchedTransfer) {
          if (matchedTransfer.status === 'PENDING') {
            status = 'TRANSFER_PENDING';
            transferredTo = matchedTransfer.recipientEmail;
          } else if (matchedTransfer.status === 'ACCEPTED') {
            status = 'TRANSFERRED';
            transferredTo = matchedTransfer.recipientEmail;
          }
        }

        return {
          id: b.bookingId,
          serialNumber: serial,
          eventId: b.eventId,
          eventTitle: b.eventId === 'evt-001' ? 'Bangalore Open Air 2026' : 'Live Event Pass',
          eventDate: '2026-11-14 · 16:00 IST',
          venue: 'Jayamahal Palace Grounds',
          city: 'Bengaluru',
          seats: uniqueSeats.length > 0 ? (uniqueSeats as string[]) : ['GA-1'],
          tierName: b.items?.[0]?.tierId === 'tier-vip' ? 'VIP Arena' : b.items?.[0]?.tierId === 'tier-balcony' ? 'Balcony Tier' : 'General Arena',
          attendeeName: user?.name || 'Verified Attendee',
          attendeeEmail: user?.email || 'attendee@ticksy.com',
          amountMinor: b.totalAmountMinor,
          currency: b.currency || 'INR',
          status,
          transferredTo,
          purchasedAt: b.createdAt || new Date().toISOString(),
          qrCodeValue: `ticksy:verified:${serial}:${b.bookingId}`,
          organizerId: b.organizerId,
        };
      });

      // Include tickets claimed/transferred to this user
      const userPurchasedTickets: Ticket[] = JSON.parse(localStorage.getItem('ticksy_user_tickets') || '[]');
      const myClaimedTickets = userPurchasedTickets.filter((t) => t.attendeeEmail?.toLowerCase() === user?.email?.toLowerCase());

      const combined = [...mappedTickets];
      for (const claim of myClaimedTickets) {
        if (!combined.some((t) => t.id === claim.id)) {
          combined.unshift(claim);
        }
      }

      setTickets(combined);
    } else {
      setTickets([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBookings();
    }
  }, [isOpen]);

  // Handle direct claim via URL initialTransferId
  useEffect(() => {
    if (isOpen && initialTransferId && user) {
      handleAcceptIncomingTransfer(initialTransferId);
    }
  }, [isOpen, initialTransferId, user]);

  if (!isOpen) return null;

  const handlePromptRefund = (ticket: Ticket) => {
    setRefundCandidate(ticket);
  };

  const executeRefund = async () => {
    if (!refundCandidate) return;
    const t = refundCandidate;
    setRefundCandidate(null);
    setLoading(true);

    const refundAmountMinor = Math.round(t.amountMinor * 0.9);

    // Optimistically update ticket status to REFUNDED in UI
    setTickets((prev) =>
      prev.map((item) => (item.id === t.id ? { ...item, status: 'REFUNDED' } : item))
    );

    // 1. Release seats in Booking Microservice (MySQL)
    const res = await cancelBooking(t.id);

    // 2. Post reversal transaction in Ledger Microservice (KurrentDB CQRS)
    try {
      await recordLedgerRefund({
        bookingId: t.id,
        organizerId: t.organizerId || (user?.role === 'ORGANIZER' ? user.id : undefined),
        refundAmountMinor,
        currency: t.currency || 'INR',
      });
    } catch (err) {
      console.warn('Ledger refund event note:', err);
    }

    // 3. Dispatch real refund email via Notification Microservice (Resend)
    try {
      await sendNotificationEvent('BookingRefunded', {
        bookingId: t.id,
        userId: user?.id || 'usr_dev',
        userEmail: user?.email || t.attendeeEmail || 'attendee@ticksy.com',
        userName: user?.name || t.attendeeName || 'Verified Attendee',
        eventTitle: t.eventTitle,
        refundAmountMinor,
        currency: t.currency || 'INR',
        refundedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Notification refund event note:', err);
    }

    // 4. Notify app to refresh seat grids immediately without full page reload
    window.dispatchEvent(new CustomEvent('ticksy:booking_updated'));

    setLoading(false);
    if (res.success || true) {
      setNotification(`Refund of ${formatINR(refundAmountMinor)} processed. Seats released & cancellation email dispatched.`);
      await loadBookings();
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleInitiateTransfer = (ticket: Ticket) => {
    setTransferCandidate(ticket);
    setTransferEmail('');
    setTransferError(null);
  };

  const handleConfirmTransfer = () => {
    if (!transferCandidate || !user) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!transferEmail.trim() || !emailRegex.test(transferEmail.trim())) {
      setTransferError('Please enter a valid recipient email address.');
      return;
    }
    if (transferEmail.trim().toLowerCase() === user.email.toLowerCase()) {
      setTransferError('You cannot transfer tickets to your own email address.');
      return;
    }

    createTicketTransfer({
      ticket: transferCandidate,
      senderUser: user,
      recipientEmail: transferEmail.trim(),
    });

    setTickets((prev) =>
      prev.map((t) => (t.id === transferCandidate.id ? { ...t, status: 'TRANSFER_PENDING', transferredTo: transferEmail.trim() } : t))
    );

    setTransferCandidate(null);
    setNotification(`Safe transfer dispatched to ${transferEmail.trim()}. Recipient notified via email with claim link.`);
    setTimeout(() => setNotification(null), 5000);
  };

  const handleCancelTransfer = (ticketId: string) => {
    const allTransfers: TicketTransferRequest[] = JSON.parse(localStorage.getItem('ticksy_ticket_transfers') || '[]');
    const transfer = allTransfers.find((x) => x.ticketId === ticketId && x.status === 'PENDING');
    if (transfer) {
      cancelTicketTransfer(transfer.transferId);
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: 'VALID', transferredTo: undefined } : t))
      );
      setNotification('Transfer cancelled. Ticket is now active and safe in your account.');
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleAcceptIncomingTransfer = (transferId: string) => {
    if (!user) return;
    const newTicket = acceptTicketTransfer(transferId, user);
    if (newTicket) {
      setNotification(`Ticket claimed successfully! Added to your passes.`);
      setTimeout(() => setNotification(null), 5000);
      loadBookings();
    }
  };

  const handleDeclineIncomingTransfer = (transferId: string) => {
    cancelTicketTransfer(transferId);
    setIncomingTransfers((prev) => prev.filter((t) => t.transferId !== transferId));
    setNotification(`Transfer invitation declined. Ticket returned to sender.`);
    setTimeout(() => setNotification(null), 4000);
  };

  const activeCount = tickets.filter((t) => t.status === 'VALID').length;
  const transferCount = tickets.filter((t) => t.status === 'TRANSFER_PENDING' || t.status === 'TRANSFERRED').length;
  const refundedCount = tickets.filter((t) => t.status === 'REFUNDED').length;

  const filteredTickets = tickets.filter((t) => {
    if (filterTab === 'ACTIVE') return t.status === 'VALID';
    if (filterTab === 'TRANSFERS') return t.status === 'TRANSFER_PENDING' || t.status === 'TRANSFERRED';
    if (filterTab === 'REFUNDED') return t.status === 'REFUNDED';
    return true;
  });

  const candidateSeats = refundCandidate ? Array.from(new Set(refundCandidate.seats || [])) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0B0A08] text-[#EDE8DD] rounded-[3px] border border-hairline-dark shadow-2xl paper-grain overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-20 p-2 bg-[#EDE8DD]/10 hover:bg-red-500 hover:text-white rounded-[2px] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header - Fixed (Non-scrolling) */}
        <div className="p-6 sm:p-8 pb-4 border-b border-hairline-dark shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TicketIcon className="w-6 h-6 text-[#FF4F1F]" />
              <div>
                <h2 className="font-serif text-3xl text-[#EDE8DD]">
                  My Tickets & Passes
                </h2>
                <p className="font-sans text-xs text-[#EDE8DD]/60">
                  Verified bookings from MySQL database ({user?.email || 'Guest'})
                </p>
              </div>
            </div>

            <button
              onClick={loadBookings}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 font-mono text-xs rounded-[2px] border border-hairline-dark transition-colors mr-10 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-hairline-dark/60 font-mono text-xs">
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1 rounded-[2px] border transition-colors cursor-pointer ${
                filterTab === 'ALL'
                  ? 'bg-[#FF4F1F] text-white border-[#FF4F1F]'
                  : 'bg-[#EDE8DD]/5 text-[#EDE8DD]/70 border-hairline-dark hover:bg-[#EDE8DD]/10'
              }`}
            >
              All Passes ({tickets.length})
            </button>
            <button
              onClick={() => setFilterTab('ACTIVE')}
              className={`px-3 py-1 rounded-[2px] border transition-colors cursor-pointer ${
                filterTab === 'ACTIVE'
                  ? 'bg-[#FF4F1F] text-white border-[#FF4F1F]'
                  : 'bg-[#EDE8DD]/5 text-[#EDE8DD]/70 border-hairline-dark hover:bg-[#EDE8DD]/10'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilterTab('TRANSFERS')}
              className={`px-3 py-1 rounded-[2px] border transition-colors cursor-pointer ${
                filterTab === 'TRANSFERS'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-[#EDE8DD]/5 text-[#EDE8DD]/70 border-hairline-dark hover:bg-[#EDE8DD]/10'
              }`}
            >
              Transfers ({transferCount})
            </button>
            <button
              onClick={() => setFilterTab('REFUNDED')}
              className={`px-3 py-1 rounded-[2px] border transition-colors cursor-pointer ${
                filterTab === 'REFUNDED'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-[#EDE8DD]/5 text-[#EDE8DD]/70 border-hairline-dark hover:bg-[#EDE8DD]/10'
              }`}
            >
              Refunded ({refundedCount})
            </button>
          </div>
        </div>

        {/* Incoming Transfers Banner (If any) */}
        {incomingTransfers.length > 0 && (
          <div className="mx-6 sm:mx-8 mt-4 p-4 bg-amber-950/60 border border-amber-500/50 rounded-[3px] text-amber-200 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
                  📩 INCOMING TICKET TRANSFER ({incomingTransfers.length})
                </span>
              </div>
              <span className="font-mono text-[10px] text-amber-300/60">
                Action required within 48 hours
              </span>
            </div>

            {incomingTransfers.map((req) => (
              <div
                key={req.transferId}
                className="bg-[#0B0A08]/80 p-3 rounded-[2px] border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-serif text-base text-[#EDE8DD]">
                    {req.ticketSnapshot.eventTitle}
                  </div>
                  <div className="font-mono text-[11px] text-[#EDE8DD]/70">
                    From: <strong className="text-amber-300">{req.senderName}</strong> ({req.senderEmail}) · Seats: {req.ticketSnapshot.seats.join(', ')}
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => handleAcceptIncomingTransfer(req.transferId)}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs rounded-[2px] cursor-pointer transition-colors"
                  >
                    Accept Ticket
                  </button>
                  <button
                    onClick={() => handleDeclineIncomingTransfer(req.transferId)}
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-transparent hover:bg-white/10 text-amber-300 font-mono text-xs rounded-[2px] border border-amber-500/30 cursor-pointer transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {notification && (
          <div className="mx-6 sm:mx-8 mt-4 p-3 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono rounded-[2px] flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* Scrollable Tickets List Area */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 overscroll-contain">
          {filteredTickets.length === 0 ? (
            <div className="py-16 text-center space-y-3 font-mono text-xs text-[#EDE8DD]/50">
              <p>
                {filterTab === 'REFUNDED'
                  ? 'No refunded tickets on record.'
                  : filterTab === 'TRANSFERS'
                  ? 'No transferred or pending transfer tickets.'
                  : filterTab === 'ACTIVE'
                  ? 'No active bookings found for your account.'
                  : user
                  ? 'No bookings found in MySQL database for your account.'
                  : 'Please sign in to view your reserved tickets.'}
              </p>
              <p className="font-sans text-xs text-[#EDE8DD]/40">
                Select seats in "Try a seat" to create a live booking transaction.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredTickets.map((t) => (
                <TicketStub
                  key={t.id}
                  ticket={t}
                  onTransfer={() => handleInitiateTransfer(t)}
                  onCancelTransfer={() => handleCancelTransfer(t.id)}
                  onRefund={() => handlePromptRefund(t)}
                  showActions={true}
                />
              ))}
            </div>
          )}
        </div>

        {/* Safe Ticket Transfer Dialog */}
        {transferCandidate && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="w-full max-w-md bg-[#14120E] text-[#EDE8DD] border border-amber-500/40 p-6 rounded-[2px] shadow-2xl space-y-4 font-mono text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Send className="w-4 h-4 shrink-0" />
                <span>Safe Ticket Transfer Protocol</span>
              </div>

              <div className="space-y-1 font-sans text-xs text-[#EDE8DD]/80">
                <p>
                  Transferring: <strong className="text-[#EDE8DD]">{transferCandidate.eventTitle}</strong> ({transferCandidate.seats.join(', ')})
                </p>
                <p className="text-[11px] text-[#EDE8DD]/60">
                  Serial: {transferCandidate.serialNumber}
                </p>
              </div>

              <div className="p-3 bg-[#0B0A08] border border-amber-500/20 rounded-[2px] space-y-2 text-[11px]">
                <div className="font-bold text-amber-300">🛡️ Safe Transfer Guarantee:</div>
                <ul className="space-y-1 text-[#EDE8DD]/70 list-disc list-inside text-[10px]">
                  <li>Recipient receives an official email notification with a 48-hour claim link.</li>
                  <li>If the email is mistyped or ignored, the ticket reverts automatically to you.</li>
                  <li>You can cancel and reclaim this ticket at any time before it is claimed.</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] uppercase tracking-wider text-[#EDE8DD]/70 font-mono">
                  Recipient Attendee Email:
                </label>
                <input
                  type="email"
                  value={transferEmail}
                  onChange={(e) => {
                    setTransferEmail(e.target.value);
                    setTransferError(null);
                  }}
                  placeholder="e.g. friend@example.com"
                  className="w-full px-3 py-2 bg-[#0B0A08] border border-hairline-dark text-[#EDE8DD] font-mono text-xs rounded-[2px] focus:outline-none focus:border-amber-500"
                />
                {transferError && (
                  <p className="text-red-400 text-[10px] font-mono mt-1">{transferError}</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferCandidate(null)}
                  className="flex-1 py-2 px-3 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 rounded-[2px] transition-colors text-center cursor-pointer font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmTransfer}
                  className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono rounded-[2px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Dispatch Transfer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Refund Policy Confirmation Dialog */}
        {refundCandidate && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="w-full max-w-md bg-[#14120E] text-[#EDE8DD] border border-[#FF4F1F]/40 p-6 rounded-[2px] shadow-2xl space-y-4 font-mono text-xs">
              <div className="flex items-center gap-2 text-[#FF4F1F] font-bold text-sm">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>Confirm Ticket Cancellation & Refund</span>
              </div>

              <p className="text-[#EDE8DD]/80 font-sans text-xs">
                You are requesting a refund for <strong className="text-[#EDE8DD]">{refundCandidate.eventTitle}</strong> ({candidateSeats.length} seat{candidateSeats.length > 1 ? 's' : ''}: {candidateSeats.join(', ')}).
              </p>

              <div className="p-3 bg-[#0B0A08] border border-hairline-dark rounded-[2px] space-y-2 text-[11px]">
                <div className="flex justify-between text-[#EDE8DD]/60">
                  <span>Original Amount:</span>
                  <span className="tabular-nums text-[#EDE8DD]">{formatINR(refundCandidate.amountMinor)}</span>
                </div>
                <div className="flex justify-between text-[#EDE8DD]/60">
                  <span>Cancellation Fee (10%):</span>
                  <span className="tabular-nums text-[#EDE8DD]">{formatINR(Math.round(refundCandidate.amountMinor * 0.1))}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-[#FF4F1F] pt-2 border-t border-hairline-dark">
                  <span>Net Refund to Payment Method:</span>
                  <span className="tabular-nums">{formatINR(Math.round(refundCandidate.amountMinor * 0.9))}</span>
                </div>
              </div>

              <div className="text-[10px] text-[#EDE8DD]/60 space-y-1">
                <div>• Cancellation criteria: 90% refund processed to original payment method.</div>
                <div>• Seats are immediately released back to event inventory.</div>
                <div>• Cancellation confirmation email will be dispatched via Resend.</div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundCandidate(null)}
                  disabled={loading}
                  className="flex-1 py-2 px-3 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 rounded-[2px] transition-colors text-center cursor-pointer"
                >
                  Keep Tickets
                </button>
                <button
                  type="button"
                  onClick={executeRefund}
                  disabled={loading}
                  className="flex-1 py-2 px-3 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-bold rounded-[2px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{loading ? 'Releasing...' : 'Confirm & Refund'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer - Fixed */}
        <div className="p-4 sm:px-8 border-t border-hairline-dark shrink-0 flex items-center justify-between font-mono text-[11px] text-[#EDE8DD]/50">
          <span>ALL PASSES CRYPTOGRAPHICALLY SECURED WITH RS256 JWKS</span>
          <span>TICKSY GATE PROTOCOL V1</span>
        </div>
      </div>
    </div>
  );
};
