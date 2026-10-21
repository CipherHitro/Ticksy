import React, { useState, useEffect } from 'react';
import { formatINR, formatTimer } from '../../utils/formatters';
import { Clock, Users, ArrowRight, Check, AlertCircle } from 'lucide-react';
import type { EventItem, Seat } from '../../types';
import { createBookingHold, getEventSeats } from '../../services/api';
import { useAuth } from '../../services/authContext';

interface TryASeatSectionProps {
  event?: EventItem | null;
  onProceedWithSeats: (seats: Seat[]) => void;
}

interface BackendSeat {
  id: number;
  label: string;
  status: string; // 'AVAILABLE' | 'HELD' | 'SOLD'
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

export const TryASeatSection: React.FC<TryASeatSectionProps> = ({
  event,
  onProceedWithSeats,
}) => {
  const { user, openAuthModal } = useAuth();
  const activeEventId = event?.id || 'evt-001';

  const [tiers, setTiers] = useState<BackendTier[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(['A-2']);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(600); // 10 minutes (matching HOLD_TTL_SECONDS)
  const [timerActive, setTimerActive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch real seat map from MySQL
  const loadSeatMap = async () => {
    const res = await getEventSeats(activeEventId);
    if (res.success && res.data?.tiers) {
      setTiers(res.data.tiers);
    }
  };

  useEffect(() => {
    loadSeatMap();
  }, [activeEventId]);

  useEffect(() => {
    if (!timerActive || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, countdown]);

  // Flatten all seats from tiers
  const seatLookup = new Map<string, { tierId: string; tierName: string; priceMinor: number; status: string }>();
  tiers.forEach((t) => {
    t.seats.forEach((s) => {
      seatLookup.set(s.label, {
        tierId: t.tierId,
        tierName: t.name,
        priceMinor: t.priceMinor,
        status: s.status,
      });
    });
  });

  const handleSeatClick = (seatLabel: string) => {
    const seatInfo = seatLookup.get(seatLabel);
    if (!seatInfo || seatInfo.status !== 'AVAILABLE') return;

    setErrorMsg(null);
    if (selectedLabels.includes(seatLabel)) {
      setSelectedLabels(selectedLabels.filter((l) => l !== seatLabel));
    } else {
      if (selectedLabels.length >= 6) {
        setErrorMsg('Maximum 6 seats allowed per booking transaction.');
        return;
      }
      setSelectedLabels([...selectedLabels, seatLabel]);
    }
  };

  const handleHoldSeats = async () => {
    if (selectedLabels.length === 0) return;
    if (!user) {
      openAuthModal('login');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const seatPayload = selectedLabels.map((lbl) => {
      const info = seatLookup.get(lbl);
      return {
        tierId: info?.tierId || 'tier-general',
        seatLabel: lbl,
      };
    });

    const res = await createBookingHold(activeEventId, seatPayload);
    setLoading(false);

    if (res.success && res.data) {
      setActiveBookingId(res.data.bookingId);
      setSuccessMsg(`Seats locked in Redis & MySQL (Booking: ${res.data.bookingId.slice(0, 8)})`);
      setCountdown(600);
      setTimerActive(true);
      await loadSeatMap();
    } else {
      setErrorMsg(res.message || 'Seat unavailable or held by another attendee.');
      await loadSeatMap();
    }
  };

  // Group seats by row (e.g. A, B, C...)
  const rowsMap = new Map<string, string[]>();
  for (const label of seatLookup.keys()) {
    const row = label.split('-')[0];
    if (!rowsMap.has(row)) {
      rowsMap.set(row, []);
    }
    rowsMap.get(row)!.push(label);
  }
  const sortedRows = Array.from(rowsMap.keys()).sort();

  const totalCostMinor = selectedLabels.reduce((sum, lbl) => {
    return sum + (seatLookup.get(lbl)?.priceMinor || 79900);
  }, 0);

  const heldSeatsData: Seat[] = selectedLabels.map((lbl) => {
    const [row, num] = lbl.split('-');
    const info = seatLookup.get(lbl);
    return {
      id: lbl,
      row,
      number: parseInt(num) || 1,
      tierId: info?.tierId || 'tier-general',
      tierName: info?.tierName || 'Reserved Arena',
      priceMinor: info?.priceMinor || 79900,
      status: 'held',
      heldByMe: true,
    };
  });

  return (
    <section id="try-seat-section" className="bg-[#EDE8DD] text-[#0B0A08] py-20 border-b border-hairline-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-2">
              REAL-TIME BACKEND INVENTORY · MYSQL & REDIS
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0B0A08]">
              {event?.title || 'Bangalore Open Air 2026'}
            </h2>
            <p className="mt-2 font-sans text-sm text-[#0B0A08]/70 max-w-lg">
              Live seat map queried directly from MySQL 8. Click any seat to test the Redis front-door lock with distributed row concurrency.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-[#0B0A08]/80 bg-[#0B0A08]/5 px-3 py-1.5 rounded-[2px] border border-[#0B0A08]/15">
            <Users className="w-3.5 h-3.5 text-[#FF4F1F]" />
            <span>Connected to Booking Microservice (Port 4003)</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-900 text-xs font-mono rounded-[2px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-100 border border-emerald-400 text-emerald-900 text-xs font-mono rounded-[2px] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
            {activeBookingId && (
              <span className="text-[10px] bg-emerald-200/80 px-2 py-0.5 rounded border border-emerald-400/50 uppercase tracking-wider font-bold">
                HOLD #{activeBookingId.slice(0, 8)}
              </span>
            )}
          </div>
        )}

        {/* Interactive Map & Order Summary Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Seat Grid View (8 cols) */}
          <div className="lg:col-span-8 p-6 sm:p-8 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px] shadow-sm">
            {/* Stage Bar */}
            <div className="w-full py-2 bg-[#0B0A08]/10 text-center font-mono text-xs text-[#0B0A08]/60 tracking-widest uppercase mb-8 border border-[#0B0A08]/15 rounded-[2px]">
              MAIN CONCERT SOUNDSTAGE / PODIUM
            </div>

            {/* Rows and Seats */}
            <div className="space-y-3 overflow-x-auto pb-4">
              {sortedRows.length === 0 ? (
                <div className="text-center py-12 font-mono text-xs text-[#0B0A08]/50">
                  Loading seat inventory from MySQL...
                </div>
              ) : (
                sortedRows.map((row) => {
                  const labels = (rowsMap.get(row) || []).sort((a, b) => {
                    const numA = parseInt(a.split('-')[1]) || 0;
                    const numB = parseInt(b.split('-')[1]) || 0;
                    return numA - numB;
                  });

                  return (
                    <div key={row} className="flex items-center gap-2 min-w-[500px] justify-center">
                      <span className="font-mono text-xs text-[#0B0A08]/50 w-6 text-right font-bold">
                        {row}
                      </span>
                      <div className="flex gap-2">
                        {labels.map((seatLabel) => {
                          const seatInfo = seatLookup.get(seatLabel);
                          const isAvailable = seatInfo?.status === 'AVAILABLE';
                          const isHeld = seatInfo?.status === 'HELD';
                          const isSold = seatInfo?.status === 'SOLD';
                          const isSelected = selectedLabels.includes(seatLabel);

                          let btnStyle = 'bg-[#EDE8DD] border-[#0B0A08]/20 text-[#0B0A08]/80 hover:border-[#0B0A08]/80';
                          if (isSelected) {
                            btnStyle = 'bg-[#FF4F1F] text-white border-[#FF4F1F] ring-2 ring-[#FF4F1F]/30 font-bold';
                          } else if (isHeld) {
                            btnStyle = 'bg-[#B8975A]/20 text-[#B8975A] border-[#B8975A]/40 cursor-not-allowed';
                          } else if (isSold) {
                            btnStyle = 'bg-[#0B0A08]/10 text-[#0B0A08]/20 border-transparent cursor-not-allowed line-through';
                          }

                          const colNum = seatLabel.split('-')[1];

                          return (
                            <button
                              key={seatLabel}
                              onClick={() => handleSeatClick(seatLabel)}
                              disabled={!isAvailable}
                              title={`Seat ${seatLabel} (${seatInfo?.tierName}: ${formatINR(seatInfo?.priceMinor || 0)}) - Status: ${seatInfo?.status}`}
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[2px] font-mono text-xs transition-all duration-150 border flex items-center justify-center ${btnStyle}`}
                            >
                              {colNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Legend */}
            <div className="mt-8 pt-6 border-t border-[#0B0A08]/15 flex flex-wrap items-center justify-center gap-6 font-mono text-xs text-[#0B0A08]/70">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-[#EDE8DD] border border-[#0B0A08]/30 rounded-[2px]" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-[#FF4F1F] border border-[#FF4F1F] rounded-[2px]" />
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-[#B8975A]/20 border border-[#B8975A]/40 rounded-[2px]" />
                <span>Held (Redis)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-[#0B0A08]/15 border border-transparent rounded-[2px] line-through text-[10px] flex items-center justify-center">
                  ✕
                </span>
                <span>Sold (MySQL)</span>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Order Summary & Real-time Hold Timer */}
          <div className="lg:col-span-4 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px] p-6 sm:p-8 space-y-6 shadow-sm">
            {/* Hold Timer Card */}
            <div className="bg-[#0B0A08] text-[#EDE8DD] p-4 rounded-[3px] space-y-2 border border-hairline-dark">
              <div className="flex items-center justify-between text-xs font-mono text-[#EDE8DD]/70">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF4F1F] animate-ping" />
                  REDIS DISTRIBUTED HOLD
                </span>
                <Clock className="w-3.5 h-3.5 text-[#FF4F1F]" />
              </div>
              <div className="font-mono text-3xl font-bold tracking-tight text-[#FF4F1F]">
                {formatTimer(countdown)}
              </div>
              <p className="font-sans text-[11px] text-[#EDE8DD]/60">
                Key: <code className="text-[#EDE8DD]/90">hold:{activeEventId}:*</code> TTL: 600s
              </p>
            </div>

            {/* Selected Seats Breakdown */}
            <div className="space-y-4">
              <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 pb-2 border-b border-[#0B0A08]/15">
                SEAT SELECTION ({selectedLabels.length})
              </div>

              {selectedLabels.length === 0 ? (
                <div className="py-6 text-center text-xs font-mono text-[#0B0A08]/50">
                  Click an available seat to lock it
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedLabels.map((lbl) => {
                    const info = seatLookup.get(lbl);
                    return (
                      <div
                        key={lbl}
                        className="flex items-center justify-between text-xs font-mono py-1.5 px-2 bg-[#EDE8DD] border border-[#0B0A08]/10 rounded-[2px]"
                      >
                        <div className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-[#FF4F1F]" />
                          <span className="font-bold">Seat {lbl}</span>
                          <span className="text-[11px] text-[#0B0A08]/60">({info?.tierName})</span>
                        </div>
                        <span className="font-semibold">{formatINR(info?.priceMinor || 79900)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pricing Total */}
            <div className="pt-4 border-t border-[#0B0A08]/15 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-[#0B0A08]/70">
                <span>Seats subtotal</span>
                <span>{formatINR(totalCostMinor)}</span>
              </div>
              <div className="flex justify-between text-[#0B0A08]/70">
                <span>Platform fee (5%)</span>
                <span>{formatINR(Math.round(totalCostMinor * 0.05))}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#0B0A08] pt-2 border-t border-[#0B0A08]/10 font-sans">
                <span>Total amount</span>
                <span className="font-mono">{formatINR(totalCostMinor + Math.round(totalCostMinor * 0.05))}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleHoldSeats}
                disabled={selectedLabels.length === 0 || loading}
                className="w-full py-3 bg-[#0B0A08] text-[#EDE8DD] hover:bg-[#0B0A08]/90 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-wider rounded-[2px] transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Acquiring Redis Lock...' : '1. Lock Seats in Redis'}
              </button>

              <button
                onClick={() => onProceedWithSeats(heldSeatsData)}
                disabled={selectedLabels.length === 0}
                className="w-full py-3 bg-[#FF4F1F] text-white hover:bg-[#E0451A] disabled:opacity-40 disabled:cursor-not-allowed font-mono text-xs uppercase tracking-wider rounded-[2px] transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <span>2. Proceed to Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
