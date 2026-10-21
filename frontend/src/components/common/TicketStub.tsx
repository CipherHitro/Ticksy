import React from 'react';
import type { Ticket } from '../../types';
import { formatINR } from '../../utils/formatters';

interface TicketStubProps {
  ticket: Ticket;
  onTransfer?: () => void;
  onRefund?: () => void;
  showActions?: boolean;
}

export const TicketStub: React.FC<TicketStubProps> = ({
  ticket,
  onTransfer,
  onRefund,
  showActions = true,
}) => {
  const isRefunded = ticket.status === 'REFUNDED';

  return (
    <div className={`relative border border-hairline-dark bg-[#14120E] text-[#EDE8DD] rounded-[3px] overflow-hidden flex flex-col md:flex-row shadow-2xl transition-all duration-300 ${isRefunded ? 'opacity-50 grayscale' : ''}`}>
      {/* Top / Left Notches for physical stub feel */}
      <div className="absolute -top-3 left-1/2 md:left-2/3 -translate-x-1/2 w-6 h-6 rounded-full bg-[#0B0A08] border border-hairline-dark z-10" />
      <div className="absolute -bottom-3 left-1/2 md:left-2/3 -translate-x-1/2 w-6 h-6 rounded-full bg-[#0B0A08] border border-hairline-dark z-10" />

      {/* Main Ticket Info (2/3 width on desktop) */}
      <div className="p-6 md:p-8 flex-1 flex flex-col justify-between border-b md:border-b-0 md:border-r border-dashed border-[#EDE8DD]/20">
        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <span className="font-mono text-xs uppercase tracking-widest text-[#FF4F1F] bg-[#FF4F1F]/10 px-2 py-0.5 rounded-[2px] border border-[#FF4F1F]/20">
              {ticket.tierName}
            </span>
            <span className="font-mono text-xs text-[#EDE8DD]/60">
              SERIAL {ticket.serialNumber}
            </span>
          </div>

          <h3 className="font-serif text-3xl md:text-4xl text-[#EDE8DD] leading-tight mb-2">
            {ticket.eventTitle}
          </h3>

          <div className="space-y-1.5 font-mono text-xs text-[#EDE8DD]/80">
            <p className="flex items-center gap-2">
              <span className="text-[#EDE8DD]/40">DATE:</span> {ticket.eventDate}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-[#EDE8DD]/40">VENUE:</span> {ticket.venue}, {ticket.city}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-[#EDE8DD]/40">ATTENDEE:</span> {ticket.attendeeName} ({ticket.attendeeEmail})
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-hairline-dark flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#EDE8DD]/50">SEATS RESERVED</div>
            <div className="flex gap-1.5 mt-1">
              {ticket.seats.map((seat) => (
                <span
                  key={seat}
                  className="font-mono text-xs font-semibold px-2 py-0.5 bg-[#EDE8DD]/10 border border-[#EDE8DD]/20 rounded-[2px]"
                >
                  {seat}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#EDE8DD]/50">TOTAL PAID</div>
            <div className="font-mono text-base font-semibold text-[#EDE8DD] tabular-nums">
              {formatINR(ticket.amountMinor)}
            </div>
          </div>
        </div>
      </div>

      {/* Perforated Stub / QR verification section (1/3 width) */}
      <div className="p-6 md:p-8 md:w-64 bg-[#100F0C] flex flex-col items-center justify-between text-center relative">
        <div className="w-full flex justify-between items-center text-[10px] font-mono text-[#EDE8DD]/40 mb-2">
          <span>GATE SCAN</span>
          <span className={isRefunded ? 'text-red-400 font-bold' : 'text-emerald-400'}>
            {isRefunded ? 'REVOKED' : 'VERIFIED'}
          </span>
        </div>

        {/* Crisp vector QR representation */}
        <div className="bg-white p-3 rounded-[2px] shadow-inner my-2">
          <svg width="120" height="120" viewBox="0 0 100 100" className="w-28 h-28">
            <rect width="100" height="100" fill="#ffffff" />
            {/* Top-left position marker */}
            <rect x="10" y="10" width="28" height="28" fill="#0B0A08" />
            <rect x="14" y="14" width="20" height="20" fill="#ffffff" />
            <rect x="18" y="18" width="12" height="12" fill="#0B0A08" />
            {/* Top-right position marker */}
            <rect x="62" y="10" width="28" height="28" fill="#0B0A08" />
            <rect x="66" y="14" width="20" height="20" fill="#ffffff" />
            <rect x="70" y="18" width="12" height="12" fill="#0B0A08" />
            {/* Bottom-left position marker */}
            <rect x="10" y="62" width="28" height="28" fill="#0B0A08" />
            <rect x="14" y="66" width="20" height="20" fill="#ffffff" />
            <rect x="18" y="70" width="12" height="12" fill="#0B0A08" />
            {/* Dense binary matrix pattern */}
            <rect x="42" y="12" width="6" height="6" fill="#0B0A08" />
            <rect x="52" y="16" width="6" height="6" fill="#0B0A08" />
            <rect x="42" y="24" width="6" height="6" fill="#0B0A08" />
            <rect x="48" y="32" width="8" height="6" fill="#0B0A08" />
            <rect x="12" y="42" width="8" height="6" fill="#0B0A08" />
            <rect x="24" y="46" width="6" height="8" fill="#0B0A08" />
            <rect x="34" y="42" width="8" height="6" fill="#0B0A08" />
            <rect x="46" y="44" width="8" height="8" fill="#0B0A08" />
            <rect x="58" y="42" width="6" height="8" fill="#0B0A08" />
            <rect x="68" y="46" width="8" height="6" fill="#0B0A08" />
            <rect x="80" y="42" width="8" height="8" fill="#0B0A08" />
            <rect x="42" y="56" width="8" height="6" fill="#0B0A08" />
            <rect x="54" y="54" width="6" height="8" fill="#0B0A08" />
            <rect x="64" y="58" width="8" height="6" fill="#0B0A08" />
            <rect x="78" y="54" width="8" height="8" fill="#0B0A08" />
            <rect x="42" y="68" width="6" height="8" fill="#0B0A08" />
            <rect x="52" y="72" width="8" height="6" fill="#0B0A08" />
            <rect x="64" y="68" width="6" height="8" fill="#0B0A08" />
            <rect x="74" y="70" width="8" height="6" fill="#0B0A08" />
            <rect x="86" y="68" width="6" height="8" fill="#0B0A08" />
            <rect x="44" y="82" width="8" height="6" fill="#0B0A08" />
            <rect x="56" y="86" width="8" height="6" fill="#0B0A08" />
            <rect x="70" y="82" width="8" height="8" fill="#0B0A08" />
            <rect x="82" y="84" width="8" height="6" fill="#0B0A08" />
          </svg>
        </div>

        <div className="font-mono text-[9px] text-[#EDE8DD]/50 tracking-wider">
          ADMIT 1 PERSON PER SEAT
        </div>

        {/* Action buttons if not refunded */}
        {showActions && !isRefunded && (
          <div className="w-full flex gap-2 mt-4 pt-3 border-t border-hairline-dark">
            {onTransfer && (
              <button
                onClick={onTransfer}
                className="flex-1 py-1.5 px-2 bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 text-xs font-mono rounded-[2px] transition-colors border border-hairline-dark"
              >
                Transfer
              </button>
            )}
            {onRefund && (
              <button
                onClick={onRefund}
                className="flex-1 py-1.5 px-2 bg-transparent hover:bg-red-950/40 text-red-300 hover:text-red-200 text-xs font-mono rounded-[2px] transition-colors border border-red-500/20"
              >
                Refund
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
