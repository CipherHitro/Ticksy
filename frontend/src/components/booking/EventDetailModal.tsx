import React, { useState, useEffect } from 'react';
import type { EventItem, Seat } from '../../types';
import { formatINR } from '../../utils/formatters';
import { X, Calendar, MapPin, ArrowRight } from 'lucide-react';
import { getEventSeats } from '../../services/api';

interface EventDetailModalProps {
  event: EventItem | null;
  onClose: () => void;
  onProceedToCheckout: (event: EventItem, seats: Seat[]) => void;
}

interface BackendSeat {
  id: number;
  label: string;
  status: string;
}

interface BackendTier {
  tierId: string;
  name: string;
  priceMinor: number;
  currency: string;
  total: number;
  available: number;
  seats: BackendSeat[];
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  onClose,
  onProceedToCheckout,
}) => {
  const [tiers, setTiers] = useState<BackendTier[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);

  const fetchSeats = () => {
    if (!event) return;
    getEventSeats(event.id).then((res) => {
      if (res.success && res.data?.tiers) {
        setTiers(res.data.tiers);
      }
    });
  };

  useEffect(() => {
    fetchSeats();
    const handleUpdate = () => fetchSeats();
    window.addEventListener('ticksy:booking_updated', handleUpdate);
    return () => window.removeEventListener('ticksy:booking_updated', handleUpdate);
  }, [event]);

  if (!event) return null;

  // Flatten seat map from MySQL
  const seatMap = new Map<string, { tierId: string; tierName: string; priceMinor: number; status: string }>();
  tiers.forEach((t) => {
    t.seats.forEach((s) => {
      seatMap.set(s.label, {
        tierId: t.tierId,
        tierName: t.name,
        priceMinor: t.priceMinor,
        status: s.status,
      });
    });
  });

  const handleToggleSeat = (seatId: string) => {
    const info = seatMap.get(seatId);
    if (!info || info.status !== 'AVAILABLE') return;

    if (selectedSeatIds.includes(seatId)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seatId));
    } else {
      if (selectedSeatIds.length >= 6) return;
      setSelectedSeatIds([...selectedSeatIds, seatId]);
    }
  };

  const selectedSeatsData: Seat[] = selectedSeatIds.map((id) => {
    const [row, num] = id.split('-');
    const info = seatMap.get(id);
    return {
      id,
      row,
      number: parseInt(num) || 1,
      tierId: info?.tierId || 'tier-general',
      tierName: info?.tierName || 'Standard Pass',
      priceMinor: info?.priceMinor || event.priceMinor,
      status: 'held',
      heldByMe: true,
    };
  });

  const subtotalMinor = selectedSeatsData.reduce((acc, s) => acc + s.priceMinor, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#EDE8DD] text-[#0B0A08] rounded-[3px] border border-hairline-light shadow-2xl overflow-hidden my-8">
        {/* Close Button - Highly Visible Red */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-30 p-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-xl hover:scale-105 active:scale-95 rounded-full transition-all border border-red-400/50 cursor-pointer"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
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
          {/* Seat Selection Interactive Grid (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between border-b border-[#0B0A08]/15 pb-2">
              <span className="font-mono text-xs uppercase font-bold text-[#0B0A08]">
                PICK YOUR SEATS (MYSQL SEAT INVENTORY)
              </span>
              <span className="font-mono text-[11px] text-[#0B0A08]/60">
                Max 6 seats per booking
              </span>
            </div>

            {/* Stage Bar */}
            <div className="py-2 bg-[#0B0A08]/10 text-center font-mono text-[11px] font-bold text-[#0B0A08]/70 tracking-widest uppercase rounded-[2px] border border-[#0B0A08]/10">
              ▲ FRONT STAGE / SCREEN ▲
            </div>

            {/* Seat Map Area */}
            <div className="space-y-6 max-h-[460px] overflow-y-auto pr-2">
              {tiers.length === 0 ? (
                <div className="text-center py-12 font-mono text-xs text-[#0B0A08]/50">
                  Loading seat inventory from MySQL database...
                </div>
              ) : (
                tiers.map((tier) => {
                  const availableCount = tier.seats.filter((s) => s.status === 'AVAILABLE').length;
                  return (
                    <div key={tier.tierId} className="space-y-3 bg-[#E4DFC8]/50 p-4 rounded-[3px] border border-[#0B0A08]/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#0B0A08]">
                            {tier.name}
                          </span>
                          <span className="font-mono text-xs text-[#FF4F1F] font-semibold">
                            {formatINR(tier.priceMinor)}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-[#0B0A08]/60">
                          {availableCount} / {tier.seats.length} available
                        </span>
                      </div>

                      {/* Wrapped Seat Grid - Left-Aligned, Never Clipped */}
                      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 justify-start">
                        {tier.seats.map((seat) => {
                          const seatId = seat.label;
                          const isAvailable = seat.status === 'AVAILABLE';
                          const isSelected = selectedSeatIds.includes(seatId);
                          const isHeld = seat.status === 'HELD';
                          const isSold = seat.status === 'SOLD';
                          const seatNum = seatId.includes('-') ? seatId.split('-')[1] : seatId;

                          let btnClass = 'bg-[#EDE8DD] border-[#0B0A08]/20 text-[#0B0A08]/80 hover:border-[#0B0A08]/80 hover:bg-[#F2EDE2]';
                          if (isSelected) {
                            btnClass = 'bg-[#FF4F1F] text-white border-[#FF4F1F] ring-2 ring-[#FF4F1F]/40 font-bold scale-105';
                          } else if (isHeld) {
                            btnClass = 'bg-[#B8975A]/20 text-[#B8975A] border-[#B8975A]/40 cursor-not-allowed';
                          } else if (isSold) {
                            btnClass = 'bg-[#0B0A08]/10 text-[#0B0A08]/30 border-transparent cursor-not-allowed line-through';
                          }

                          return (
                            <button
                              key={seatId}
                              onClick={() => handleToggleSeat(seatId)}
                              disabled={!isAvailable}
                              title={`${seatId} (${tier.name}: ${formatINR(tier.priceMinor)}) - ${seat.status}`}
                              className={`h-8 rounded-[2px] font-mono text-[11px] border transition-all flex items-center justify-center cursor-pointer ${btnClass}`}
                            >
                              {seatNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Seat Map Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#0B0A08]/10 font-mono text-[10px] text-[#0B0A08]/70">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-[2px] bg-[#EDE8DD] border border-[#0B0A08]/20 inline-block" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-[2px] bg-[#FF4F1F] inline-block" />
                <span className="font-bold text-[#FF4F1F]">Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-[2px] bg-[#B8975A]/30 border border-[#B8975A]/50 inline-block" />
                <span>Held</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-[2px] bg-[#0B0A08]/10 border border-[#0B0A08]/20 inline-block line-through text-center leading-3">×</span>
                <span>Sold</span>
              </div>
            </div>
          </div>

          {/* Pricing & Checkout Summary (5 cols) */}
          <div className="lg:col-span-5 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px] p-6 space-y-6">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-1">
                SELECTION SUMMARY
              </div>
              <h3 className="font-serif text-2xl text-[#0B0A08]">
                {selectedSeatsData.length} Seat{selectedSeatsData.length === 1 ? '' : 's'} Selected
              </h3>
            </div>

            <div className="space-y-2 border-y border-[#0B0A08]/15 py-4 font-mono text-xs">
              <div className="flex justify-between text-[#0B0A08]/70">
                <span>Seats</span>
                <span className="font-bold text-[#0B0A08]">
                  {selectedSeatIds.join(', ') || 'None selected'}
                </span>
              </div>
              <div className="flex justify-between text-[#0B0A08]/70">
                <span>Subtotal</span>
                <span>{formatINR(subtotalMinor)}</span>
              </div>
              <div className="flex justify-between text-[#0B0A08]/70">
                <span>Platform fee (5%)</span>
                <span>{formatINR(Math.round(subtotalMinor * 0.05))}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#0B0A08] pt-2 border-t border-[#0B0A08]/10 font-sans">
                <span>Total amount</span>
                <span className="font-mono text-lg">{formatINR(subtotalMinor + Math.round(subtotalMinor * 0.05))}</span>
              </div>
            </div>

            <button
              onClick={() => onProceedToCheckout(event, selectedSeatsData)}
              disabled={selectedSeatsData.length === 0}
              className="w-full py-3.5 bg-[#FF4F1F] text-white hover:bg-[#E0451A] disabled:opacity-40 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-wider rounded-[2px] transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <span>Hold & Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
