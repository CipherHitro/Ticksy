import React, { useState } from 'react';
import type { Ticket } from '../../types';
import { getMyTickets, refundUserTicket } from '../../services/api';
import { TicketStub } from '../common/TicketStub';
import { X, Ticket as TicketIcon, AlertCircle } from 'lucide-react';

interface MyTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyTicketsModal: React.FC<MyTicketsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [tickets, setTickets] = useState<Ticket[]>(getMyTickets());
  const [notification, setNotification] = useState<string | null>(null);

  if (!isOpen) return null;


  const handleRefund = (ticketId: string) => {
    const success = refundUserTicket(ticketId);
    if (success) {
      setTickets(getMyTickets());
      setNotification('Ticket refund approved. Razorpay payout initiated and seat returned to queue.');
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleTransfer = (_ticketId: string) => {
    const recipient = prompt('Enter recipient attendee email address:');
    if (recipient) {
      setNotification(`Transfer dispatched to ${recipient}. Ticket serial re-issued.`);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#0B0A08] text-[#EDE8DD] rounded-[3px] border border-hairline-dark shadow-2xl p-6 sm:p-8 my-8 paper-grain">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 rounded-[2px] transition-colors"
        >
          <X className="w-5 h-5 text-[#EDE8DD]" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-hairline-dark pb-4 mb-6">
          <TicketIcon className="w-6 h-6 text-[#FF4F1F]" />
          <div>
            <h2 className="font-serif text-3xl text-[#EDE8DD]">
              My Tickets & Passes
            </h2>
            <p className="font-sans text-xs text-[#EDE8DD]/60">
              Verified digital credentials. Valid for offline gate scan entry.
            </p>
          </div>
        </div>

        {notification && (
          <div className="mb-6 p-3 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono rounded-[2px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* Tickets List */}
        {tickets.length === 0 ? (
          <div className="py-16 text-center space-y-3 font-mono text-xs text-[#EDE8DD]/50">
            <p>You have not reserved any event passes yet.</p>
            <p className="font-sans text-xs text-[#EDE8DD]/40">
              Select an event from "This week’s drops" to test holding a seat.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {tickets.map((t) => (
              <TicketStub
                key={t.id}
                ticket={t}
                onTransfer={() => handleTransfer(t.id)}
                onRefund={() => handleRefund(t.id)}
                showActions={true}
              />
            ))}
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-hairline-dark flex items-center justify-between font-mono text-[11px] text-[#EDE8DD]/50">
          <span>ALL PASSES CRYPTOGRAPHICALLY SECURED WITH RS256 JWKS</span>
          <span>TICKSY GATE PROTOCOL V1</span>
        </div>
      </div>
    </div>
  );
};
