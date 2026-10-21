import React, { useState, useEffect } from 'react';
import { formatINR, formatTimer } from '../../utils/formatters';
import { Clock, Users, ArrowRight, Check } from 'lucide-react';
import type { Seat } from '../../types';

interface TryASeatSectionProps {
  onProceedWithSeats: (seats: Seat[]) => void;
}

export const TryASeatSection: React.FC<TryASeatSectionProps> = ({
  onProceedWithSeats,
}) => {
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>(['D-6']);
  const [countdown, setCountdown] = useState<number>(480); // 8:00 minutes
  const [timerActive, setTimerActive] = useState<boolean>(true);

  // 8 rows (A to H) by 12 columns
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const cols = 12;

  // Booked seat coordinates
  const bookedSeatSet = new Set(['A-3', 'A-4', 'B-7', 'B-8', 'C-1', 'C-2', 'E-5', 'E-6', 'G-11', 'G-12']);

  useEffect(() => {
    if (!timerActive || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, countdown]);

  const handleSeatClick = (seatId: string) => {
    if (bookedSeatSet.has(seatId)) return;

    if (selectedSeatIds.includes(seatId)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seatId));
    } else {
      setSelectedSeatIds([...selectedSeatIds, seatId]);
      // Reset timer on fresh hold
      setCountdown(480);
      setTimerActive(true);
    }
  };

  // Pricing: Rows A-C (VIP ₹2,499), D-F (Balcony ₹1,499), G-H (General ₹799)
  const getSeatPriceMinor = (row: string) => {
    if (['A', 'B', 'C'].includes(row)) return 249900;
    if (['D', 'E', 'F'].includes(row)) return 149900;
    return 79900;
  };

  const getSeatTierName = (row: string) => {
    if (['A', 'B', 'C'].includes(row)) return 'VIP Stalls';
    if (['D', 'E', 'F'].includes(row)) return 'Balcony Tier';
    return 'General Rear';
  };

  const totalCostMinor = selectedSeatIds.reduce((sum, id) => {
    const row = id.split('-')[0];
    return sum + getSeatPriceMinor(row);
  }, 0);

  const heldSeatsData: Seat[] = selectedSeatIds.map((id) => {
    const [row, num] = id.split('-');
    return {
      id,
      row,
      number: parseInt(num),
      tierId: 'tier_' + row,
      tierName: getSeatTierName(row),
      priceMinor: getSeatPriceMinor(row),
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
              REAL-TIME INTERACTION
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0B0A08]">
              Try a seat
            </h2>
            <p className="mt-2 font-sans text-sm text-[#0B0A08]/70 max-w-lg">
              Click any seat below to test the 8-minute distributed hold. The lock is yours; watch the summary and timer update in real time.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-[#0B0A08]/80 bg-[#0B0A08]/5 px-3 py-1.5 rounded-[2px] border border-[#0B0A08]/15">
            <Users className="w-3.5 h-3.5 text-[#FF4F1F]" />
            <span>212 people are viewing this event</span>
          </div>
        </div>

        {/* Interactive Map & Order Summary Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Seat Grid View (8 cols) */}
          <div className="lg:col-span-8 p-6 sm:p-8 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px] shadow-sm">
            {/* Stage Bar */}
            <div className="w-full py-2 bg-[#0B0A08]/10 text-center font-mono text-xs text-[#0B0A08]/60 tracking-widest uppercase mb-8 border border-[#0B0A08]/15 rounded-[2px]">
              ACOUSTIC SOUNDSTAGE / PODIUM
            </div>

            {/* Rows and Seats */}
            <div className="space-y-2.5 overflow-x-auto pb-4">
              {rows.map((row) => (
                <div key={row} className="flex items-center gap-2 min-w-[500px] justify-center">
                  <span className="font-mono text-xs text-[#0B0A08]/50 w-6 text-right font-bold">
                    {row}
                  </span>
                  <div className="flex gap-2">
                    {Array.from({ length: cols }).map((_, cIndex) => {
                      const colNum = cIndex + 1;
                      const seatId = `${row}-${colNum}`;
                      const isBooked = bookedSeatSet.has(seatId);
                      const isSelected = selectedSeatIds.includes(seatId);

                      // Middle aisle separation
                      const isAisle = colNum === 6;

                      let btnStyle = 'bg-[#EDE8DD] border-[#0B0A08]/20 text-[#0B0A08]/80 hover:border-[#0B0A08]/80';
                      if (isSelected) {
                        btnStyle = 'bg-[#FF4F1F] text-white border-[#FF4F1F] ring-2 ring-[#FF4F1F]/30 font-bold';
                      } else if (isBooked) {
                        btnStyle = 'bg-[#0B0A08]/10 text-[#0B0A08]/20 border-transparent cursor-not-allowed line-through';
                      }

                      return (
                        <React.Fragment key={seatId}>
                          <button
                            onClick={() => handleSeatClick(seatId)}
                            disabled={isBooked}
                            title={`Seat ${seatId} (${getSeatTierName(row)}: ${formatINR(getSeatPriceMinor(row))})`}
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[2px] font-mono text-xs transition-all duration-150 border flex items-center justify-center ${btnStyle}`}
                          >
                            {colNum}
                          </button>
                          {isAisle && <div className="w-4" />}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <span className="font-mono text-[10px] text-[#0B0A08]/40 w-16 text-left">
                    {getSeatTierName(row).split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>

            {/* Map Legend */}
            <div className="mt-8 pt-4 border-t border-[#0B0A08]/15 flex flex-wrap items-center justify-between text-xs font-mono text-[#0B0A08]/70 gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-[#EDE8DD] border border-[#0B0A08]/30" />
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-[#FF4F1F]" />
                  <span>Held by you</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-[#0B0A08]/10" />
                  <span>Reserved</span>
                </div>
              </div>
              <div className="text-[11px] text-[#0B0A08]/50">
                VIP (Rows A–C: ₹2,499) · Balcony (D–F: ₹1,499) · Rear (G–H: ₹799)
              </div>
            </div>
          </div>

          {/* Real-time Hold Summary Sidebar (4 cols) */}
          <div className="lg:col-span-4 p-6 bg-[#0B0A08] text-[#EDE8DD] rounded-[3px] border border-hairline-dark shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-hairline-dark pb-4">
              <span className="font-mono text-xs text-[#EDE8DD]/60 uppercase tracking-wider">
                HOLD EXPIRATION
              </span>
              <div className="flex items-center gap-1.5 font-mono text-sm text-[#FF4F1F] font-bold">
                <Clock className="w-4 h-4" />
                <span>{formatTimer(countdown)}</span>
              </div>
            </div>

            <div>
              <div className="font-mono text-xs text-[#EDE8DD]/40 uppercase mb-2">
                SELECTED SEATS ({selectedSeatIds.length})
              </div>
              {selectedSeatIds.length === 0 ? (
                <p className="font-sans text-xs text-[#EDE8DD]/50 italic">
                  Click any seat on the left to lock it into your reservation hold.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedSeatIds.map((id) => {
                    const row = id.split('-')[0];
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between font-mono text-xs bg-[#161410] p-2 rounded-[2px] border border-hairline-dark"
                      >
                        <div>
                          <span className="font-bold text-[#FF4F1F] mr-2">Seat {id}</span>
                          <span className="text-[#EDE8DD]/50">({getSeatTierName(row)})</span>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatINR(getSeatPriceMinor(row))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-hairline-dark pt-4 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-[#EDE8DD]/60">
                <span>Seats Subtotal</span>
                <span className="tabular-nums">{formatINR(totalCostMinor)}</span>
              </div>
              <div className="flex justify-between text-[#EDE8DD]/60">
                <span>Platform fee (5%)</span>
                <span className="tabular-nums">{formatINR(Math.round(totalCostMinor * 0.05))}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#EDE8DD] pt-2 border-t border-hairline-dark">
                <span>Total Due</span>
                <span className="tabular-nums text-[#FF4F1F]">
                  {formatINR(totalCostMinor + Math.round(totalCostMinor * 0.05))}
                </span>
              </div>
            </div>

            <button
              onClick={() => onProceedWithSeats(heldSeatsData)}
              disabled={selectedSeatIds.length === 0}
              className="w-full py-3 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono text-xs font-semibold rounded-[2px] transition-colors flex items-center justify-center gap-2 shadow-md"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-2 text-[10px] font-mono text-[#EDE8DD]/50 justify-center">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Redis distributed lock actively acquired</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
