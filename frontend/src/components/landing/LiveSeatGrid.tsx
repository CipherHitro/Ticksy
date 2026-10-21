import React, { useState, useEffect } from 'react';

interface SeatDot {
  id: string;
  row: number;
  col: number;
  status: 'empty' | 'occupied' | 'held';
  label: string;
}

export const LiveSeatGrid: React.FC = () => {
  const [dots, setDots] = useState<SeatDot[]>([]);
  const [activeNotification, setActiveNotification] = useState<{ label: string; time: string } | null>({
    label: 'C14 held',
    time: '07:59',
  });

  // Generate stadium curved rows of seats
  useEffect(() => {
    const rows = 16;
    const generated: SeatDot[] = [];
    const letters = 'ABCDEFGHIJKLMNOP';

    for (let r = 0; r < rows; r++) {
      // Curve radius and count per row
      const count = 22 + Math.floor(r * 1.4);
      for (let c = 0; c < count; c++) {
        const isOccupied = Math.random() < 0.28;
        generated.push({
          id: `${letters[r]}-${c + 1}`,
          row: r,
          col: c,
          status: isOccupied ? 'occupied' : 'empty',
          label: `${letters[r]}${c + 1}`,
        });
      }
    }
    setDots(generated);
  }, []);

  // Live simulation: every 2.2 seconds, a random empty seat flips to held/booked!
  useEffect(() => {
    if (dots.length === 0) return;

    const interval = setInterval(() => {
      const emptyDots = dots.filter((d) => d.status === 'empty');
      if (emptyDots.length === 0) return;

      const randomDot = emptyDots[Math.floor(Math.random() * emptyDots.length)];
      setDots((prev) =>
        prev.map((d) => (d.id === randomDot.id ? { ...d, status: 'held' } : d))
      );

      const seconds = Math.floor(400 + Math.random() * 80);
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      setActiveNotification({
        label: `${randomDot.label} held`,
        time: `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
      });
    }, 2400);

    return () => clearInterval(interval);
  }, [dots]);

  return (
    <div className="relative w-full max-w-xl mx-auto p-6 border border-hairline-dark bg-[#110F0C] rounded-[3px] shadow-2xl overflow-hidden paper-grain">
      {/* Stadium Header Info */}
      <div className="flex items-center justify-between pb-3 border-b border-hairline-dark font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FF4F1F] animate-ping" />
          <span className="text-[#EDE8DD] font-semibold">LIVE SEAT MAP</span>
        </div>
        <div className="text-[#EDE8DD]/50">
          STADIUM SECTOR 4
        </div>
      </div>

      {/* Real-time Flash Notification Tag */}
      {activeNotification && (
        <div className="absolute top-14 right-6 z-10 px-2.5 py-1 bg-[#1A1713] border border-[#FF4F1F]/40 text-[#FF4F1F] font-mono text-[11px] rounded-[2px] shadow-md flex items-center gap-1.5 transition-all duration-300">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF4F1F]" />
          <span>{activeNotification.label}</span>
          <span className="text-[#EDE8DD]/50">· {activeNotification.time}</span>
        </div>
      )}

      {/* Curved Stadium Grid Visual */}
      <div className="py-6 flex flex-col items-center gap-1.5 overflow-hidden">
        {Array.from({ length: 12 }).map((_, rowIndex) => {
          const rowDots = dots.filter((d) => d.row === rowIndex);
          return (
            <div
              key={rowIndex}
              className="flex justify-center gap-1 transition-transform duration-300 hover:scale-[1.02]"
              style={{
                width: `${75 + rowIndex * 2}%`,
              }}
            >
              {rowDots.map((dot) => {
                let colorClass = 'bg-[#EDE8DD]/15 hover:bg-[#EDE8DD]/40';
                if (dot.status === 'held') colorClass = 'bg-[#FF4F1F] ring-2 ring-[#FF4F1F]/30';
                if (dot.status === 'occupied') colorClass = 'bg-[#EDE8DD]/40';

                return (
                  <button
                    key={dot.id}
                    title={`Seat ${dot.label} (${dot.status})`}
                    className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-[1px] transition-all duration-200 ${colorClass}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Stage marker */}
      <div className="mt-2 w-3/4 mx-auto py-1 border-t-2 border-hairline-dark text-center font-mono text-[10px] text-[#EDE8DD]/40 tracking-widest">
        STAGE / PERFORMANCE AREA
      </div>

      {/* Grid Legend */}
      <div className="mt-4 pt-3 border-t border-hairline-dark flex items-center justify-center gap-6 font-mono text-[11px] text-[#EDE8DD]/70">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[1px] bg-[#EDE8DD]/15" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[1px] bg-[#FF4F1F]" />
          <span>Held (8m lock)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[1px] bg-[#EDE8DD]/40" />
          <span>Sold</span>
        </div>
      </div>
    </div>
  );
};
