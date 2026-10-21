import React, { useState, useEffect } from 'react';
import type { EventItem, Seat } from '../../types';
import { formatINR, formatTimer } from '../../utils/formatters';
import { X, Calendar, MapPin, Clock, ArrowRight, ShieldCheck } from 'lucide-react';

interface EventDetailModalProps {
  event: EventItem | null;
  onClose: () => void;
  onProceedToCheckout: (event: EventItem, seats: Seat[]) => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  onClose,
  onProceedToCheckout,
}) => {
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>(['B-4']);
  const [countdown, setCountdown] = useState<number>(480);

  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const cols = 10;
  const bookedSeatSet = new Set(['A-1', 'A-2', 'B-1', 'C-5', 'C-6', 'D-9', 'E-3', 'E-4']);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!event) return null;


  const handleToggleSeat = (seatId: string) => {
    if (bookedSeatSet.has(seatId)) return;
    if (selectedSeatIds.includes(seatId)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seatId));
    } else {
      setSelectedSeatIds([...selectedSeatIds, seatId]);
      setCountdown(480);
    }
  };

  const getTierForSeat = (row: string) => {
    if (row === 'A' || row === 'B') {
      return event.tiers[1] || event.tiers[0];
    }
    return event.tiers[0];
  };

  const selectedSeatsData: Seat[] = selectedSeatIds.map((id) => {
    const [row, num] = id.split('-');
    const tier = getTierForSeat(row);
    return {
      id,
      row,
      number: parseInt(num),
      tierId: tier.id,
      tierName: tier.name,
      priceMinor: tier.priceMinor,
      status: 'held',
      heldByMe: true,
    };
  });

  const subtotalMinor = selectedSeatsData.reduce((acc, s) => acc + s.priceMinor, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#EDE8DD] text-[#0B0A08] rounded-[3px] border border-hairline-light shadow-2xl overflow-hidden my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 bg-[#0B0A08]/10 hover:bg-[#0B0A08]/20 rounded-[2px] transition-colors"
        >
          <X className="w-5 h-5 text-[#0B0A08]" />
        </button>

        {/* Hero Header with Poster Banner */}
        <div className="relative h-64 sm:h-72 w-full bg-[#0B0A08] overflow-hidden">
          <img
            src={event.posterUrl}
            alt={event.title}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#EDE8DD] via-[#0B0A08]/40 to-transparent" />

          <div className="absolute bottom-6 left-6 right-6">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-[2px] bg-[#FF4F1F] text-white font-mono text-xs uppercase font-bold mb-2">
              {event.genre} · {event.availableSeats} SEATS REMAINING
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#0B0A08] font-normal leading-tight">
              {event.title}
            </h2>
            <div className="flex flex-wrap items-center gap-4 mt-2 font-mono text-xs text-[#0B0A08]/80">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {event.date} · {event.time}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {event.venue}, {event.city}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Seat Selection Interactive Grid (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between border-b border-[#0B0A08]/15 pb-2">
              <span className="font-mono text-xs uppercase font-bold text-[#0B0A08]">
                PICK YOUR SEATS (INTERACTIVE MAP)
              </span>
              <div className="flex items-center gap-1.5 font-mono text-xs text-[#FF4F1F]">
                <Clock className="w-3.5 h-3.5" />
                <span>Hold expires in {formatTimer(countdown)}</span>
              </div>
            </div>

            {/* Stage Bar */}
            <div className="py-1.5 bg-[#0B0A08]/10 text-center font-mono text-[10px] text-[#0B0A08]/60 tracking-widest uppercase rounded-[2px]">
              FRONT STAGE
            </div>

            {/* Grid */}
            <div className="space-y-2 py-2">
              {rows.map((row) => (
                <div key={row} className="flex items-center justify-center gap-2">
                  <span className="font-mono text-xs w-5 font-bold text-[#0B0A08]/50">
                    {row}
                  </span>
                  <div className="flex gap-1.5">
                    {Array.from({ length: cols }).map((_, cIdx) => {
                      const num = cIdx + 1;
                      const seatId = `${row}-${num}`;
                      const isBooked = bookedSeatSet.has(seatId);
                      const isSelected = selectedSeatIds.includes(seatId);

                      let style = 'bg-[#EDE8DD] border-[#0B0A08]/20 text-[#0B0A08] hover:border-[#0B0A08]/60';
                      if (isSelected) style = 'bg-[#FF4F1F] text-white border-[#FF4F1F] font-bold ring-2 ring-[#FF4F1F]/30';
                      if (isBooked) style = 'bg-[#0B0A08]/10 text-[#0B0A08]/20 border-transparent cursor-not-allowed line-through';

                      return (
                        <button
                          key={seatId}
                          disabled={isBooked}
                          onClick={() => handleToggleSeat(seatId)}
                          className={`w-7 h-7 rounded-[2px] font-mono text-xs flex items-center justify-center border transition-all ${style}`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <p className="font-sans text-xs text-[#0B0A08]/70 pt-2">
              {event.subtitle}
            </p>
          </div>

          {/* Pricing Tiers & Summary (5 cols) */}
          <div className="lg:col-span-5 bg-[#F5F2EB] border border-[#0B0A08]/15 p-6 rounded-[3px] space-y-4">
            <div className="font-mono text-xs uppercase text-[#0B0A08]/60 font-bold border-b border-[#0B0A08]/15 pb-2">
              AVAILABLE TIERS
            </div>

            <div className="space-y-2">
              {event.tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center justify-between p-2.5 bg-[#EDE8DD] border border-[#0B0A08]/15 rounded-[2px] font-mono text-xs"
                >
                  <div>
                    <div className="font-bold text-[#0B0A08]">{tier.name}</div>
                    <div className="text-[10px] text-[#0B0A08]/60">{tier.available} passes left</div>
                  </div>
                  <div className="font-bold text-[#0B0A08] tabular-nums">
                    {formatINR(tier.priceMinor)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[#0B0A08]/15 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-[#0B0A08]/70">
                <span>Selected Seats ({selectedSeatIds.length})</span>
                <span className="font-bold">{selectedSeatIds.join(', ') || 'None'}</span>
              </div>
              <div className="flex justify-between text-[#0B0A08]/70">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatINR(subtotalMinor)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#0B0A08] pt-2 border-t border-[#0B0A08]/15">
                <span>Total Amount</span>
                <span className="tabular-nums text-[#FF4F1F]">
                  {formatINR(subtotalMinor + Math.round(subtotalMinor * 0.05))}
                </span>
              </div>
            </div>

            <button
              onClick={() => onProceedToCheckout(event, selectedSeatsData)}
              disabled={selectedSeatIds.length === 0}
              className="w-full py-3 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 disabled:opacity-40 text-white font-mono text-xs font-semibold rounded-[2px] transition-colors flex items-center justify-center gap-2"
            >
              <span>Hold & Proceed to Payment</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#0B0A08]/60 justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Redis distributed lock active for 8 minutes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
