import React from 'react';
import { LiveSeatGrid } from './LiveSeatGrid';
import { ArrowRight, ShieldCheck, Ticket } from 'lucide-react';

interface HeroSectionProps {
  onBrowseEvents: () => void;
  onOpenOrganizer: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onBrowseEvents,
  onOpenOrganizer,
}) => {
  const tickerItems = [
    'SOLD B6–B8 · Bangalore Open Air, Bengaluru · 42s ago',
    'SOLD C14 · Prateek Kuhad, Mumbai · 1m ago',
    'SOLD A1–A4 · Zakir Khan Live, Delhi · 2m ago',
    'SOLD V-08 · Sunburn Arena, Mumbai · 4m ago',
    'SOLD E12–E15 · Krunk Systems Summit, Bengaluru · 6m ago',
    'SOLD H-09 · Gaurav Kapoor, Ahmedabad · 7m ago',
  ];

  return (
    <section className="relative pt-32 pb-20 bg-[#0B0A08] text-[#EDE8DD] border-b border-hairline-dark overflow-hidden paper-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column (7 cols): Editorial Typography */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[2px] bg-[#EDE8DD]/5 border border-hairline-dark font-mono text-xs text-[#EDE8DD]/70">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4F1F]" />
              <span>FLASH-SALE SEAT ENGINE · DISTRIBUTED SAGA</span>
            </div>

            <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.98] tracking-tight text-[#EDE8DD]">
              Every seat.<br />
              Every rupee.<br />
              <span className="italic font-normal text-[#EDE8DD]">Accounted</span> for.
            </h1>

            <p className="font-sans text-lg md:text-xl text-[#EDE8DD]/70 max-w-xl font-normal leading-relaxed">
              Live events with a fair queue for fans and a ledger you can audit for organizers. Zero double-bookings, 8-minute distributed seat holds, and instant UPI payouts.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={onBrowseEvents}
                className="px-6 py-3.5 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-sm font-semibold rounded-[2px] transition-all flex items-center gap-2 shadow-lg"
              >
                <span>Browse events</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenOrganizer}
                className="px-6 py-3.5 bg-transparent hover:bg-[#EDE8DD]/10 text-[#EDE8DD] font-mono text-sm font-semibold rounded-[2px] border border-hairline-dark hover:border-[#EDE8DD]/40 transition-all flex items-center gap-2"
              >
                <span>I’m an organizer</span>
                <span className="text-[#B8975A]">→</span>
              </button>
            </div>

            {/* Proof guarantee labels */}
            <div className="pt-4 flex flex-wrap gap-6 font-mono text-xs text-[#EDE8DD]/60 border-t border-hairline-dark">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#FF4F1F]" />
                <span>Deterministic Queue</span>
              </div>
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#EDE8DD]/80" />
                <span>Anti-Scalper Locks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#B8975A] font-bold">₹</span>
                <span>Audited Ledger</span>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Live Stadium Grid */}
          <div className="lg:col-span-5 flex justify-center">
            <LiveSeatGrid />
          </div>
        </div>
      </div>

      {/* Bottom Live Sold Seats Ticker */}
      <div className="mt-16 border-t border-hairline-dark bg-[#0E0C09] py-2.5 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-4">
          <span className="shrink-0 font-mono text-[10px] uppercase font-bold text-[#FF4F1F] bg-[#FF4F1F]/10 px-2 py-0.5 rounded-[2px] border border-[#FF4F1F]/20">
            LIVE TICKER
          </span>
          <div className="flex gap-8 overflow-x-auto no-scrollbar font-mono text-xs text-[#EDE8DD]/70 whitespace-nowrap">
            {tickerItems.map((item, idx) => (
              <span key={idx} className="inline-flex items-center gap-2">
                <span className="text-[#EDE8DD] font-medium">{item}</span>
                {idx < tickerItems.length - 1 && <span className="text-[#EDE8DD]/20">·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
