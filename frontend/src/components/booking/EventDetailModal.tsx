import React, { useState, useEffect } from 'react';
import type { EventItem, Seat } from '../../types';
import { formatINR, formatTimer } from '../../utils/formatters';
import { X, Calendar, MapPin, Clock, ArrowRight } from 'lucide-react';
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
  const [countdown, setCountdown] = useState<number>(600);

  useEffect(() => {
    if (!event) return;
    getEventSeats(event.id).then((res) => {
      if (res.success && res.data?.tiers) {
        setTiers(res.data.tiers);
      }
    });
  }, [event]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      setCountdown(600);
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

  // Group by row
  const rowLabels = new Map<string, string[]>();
  for (const label of seatMap.keys()) {
    const row = label.split('-')[0];
    if (!rowLabels.has(row)) rowLabels.set(row, []);
    rowLabels.get(row)!.push(label);
  }
  const sortedRows = Array.from(rowLabels.keys()).sort();

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
                PICK YOUR SEATS (MYSQL SEAT INVENTORY)
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
            <div className="space-y-2 py-2 overflow-x-auto">
              {sortedRows.length === 0 ? (
                <div className="text-center py-8 font-mono text-xs text-[#0B0A08]/50">
                  Loading seats from MySQL...
                </div>
              ) : (
                sortedRows.map((row) => {
                  const labels = (rowLabels.get(row) || []).sort((a, b) => {
                    const numA = parseInt(a.split('-')[1]) || 0;
                    const numB = parseInt(b.split('-')[1]) || 0;
                    return numA - numB;
                  });

                  return (
                    <div key={row} className="flex items-center justify-center gap-2 min-w-[360px]">
                      <span className="font-mono text-xs w-5 font-bold text-[#0B0A08]/50">
                        {row}
                      </span>
                      <div className="flex gap-1.5">
                        {labels.map((seatId) => {
                          const info = seatMap.get(seatId);
                          const isAvailable = info?.status === 'AVAILABLE';
                          const isSelected = selectedSeatIds.includes(seatId);
                          const isHeld = info?.status === 'HELD';
                          const isSold = info?.status === 'SOLD';

                          let btnClass = 'bg-[#EDE8DD] border-[#0B0A08]/20 text-[#0B0A08]/80 hover:border-[#0B0A08]/80';
                          if (isSelected) {
                            btnClass = 'bg-[#FF4F1F] text-white border-[#FF4F1F] ring-2 ring-[#FF4F1F]/30 font-bold';
                          } else if (isHeld) {
                            btnClass = 'bg-[#B8975A]/20 text-[#B8975A] border-[#B8975A]/40 cursor-not-allowed';
                          } else if (isSold) {
                            btnClass = 'bg-[#0B0A08]/10 text-[#0B0A08]/20 border-transparent cursor-not-allowed line-through';
                          }

                          return (
                            <button
                              key={seatId}
                              onClick={() => handleToggleSeat(seatId)}
                              disabled={!isAvailable}
                              title={`${seatId} (${info?.tierName}: ${formatINR(info?.priceMinor || 0)})`}
                              className={`w-7 h-7 rounded-[2px] font-mono text-[11px] border transition-all flex items-center justify-center ${btnClass}`}
                            >
                              {seatId.split('-')[1]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
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
