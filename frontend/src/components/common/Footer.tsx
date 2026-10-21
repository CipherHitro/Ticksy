import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface FooterProps {
  onBrowseEvents: () => void;
  onOpenOrganizer: () => void;
  onOpenArchitecture: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onBrowseEvents,
  onOpenOrganizer,
  onOpenArchitecture,
}) => {
  return (
    <footer className="bg-[#0B0A08] text-[#EDE8DD] border-t border-hairline-dark relative overflow-hidden paper-grain">
      {/* Final Call CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center relative z-10">
        <h2 className="font-serif text-5xl sm:text-7xl md:text-8xl text-[#EDE8DD] tracking-tight mb-6">
          Your seat is waiting.
        </h2>
        <p className="font-sans text-base text-[#EDE8DD]/60 max-w-lg mx-auto mb-8 font-normal">
          Fair flash-sale queues, guaranteed 8-minute seat holds, and zero double-bookings.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={onBrowseEvents}
            className="px-8 py-4 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-sm font-semibold rounded-[2px] transition-colors shadow-xl"
          >
            Find your event
          </button>
          <button
            onClick={onOpenOrganizer}
            className="px-8 py-4 bg-transparent hover:bg-[#EDE8DD]/10 text-[#EDE8DD] font-mono text-sm font-semibold rounded-[2px] border border-hairline-dark transition-colors"
          >
            Curate on Ticksy
          </button>
        </div>

        {/* Lit Stadium Seat Grid Line return */}
        <div className="mt-16 flex justify-center gap-1.5 opacity-60">
          {Array.from({ length: 48 }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-[1px] ${
                i % 7 === 0 ? 'bg-[#FF4F1F]' : 'bg-[#EDE8DD]/40'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 4 Quiet Link Columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-hairline-dark grid grid-cols-2 md:grid-cols-4 gap-8 font-mono text-xs">
        <div className="space-y-3">
          <div className="text-[#EDE8DD]/40 uppercase tracking-wider font-semibold">EVENTS</div>
          <ul className="space-y-2 text-[#EDE8DD]/70">
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Music & Festivals</button></li>
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Tech Summits</button></li>
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Stand-Up Comedy</button></li>
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Private Drops</button></li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="text-[#EDE8DD]/40 uppercase tracking-wider font-semibold">PLATFORM</div>
          <ul className="space-y-2 text-[#EDE8DD]/70">
            <li><button onClick={onOpenOrganizer} className="hover:text-[#EDE8DD]">Organizer Portal</button></li>
            <li><button onClick={onOpenOrganizer} className="hover:text-[#EDE8DD]">Immutable Ledger</button></li>
            <li><a href="#try-seat-section" className="hover:text-[#EDE8DD]">8-Min Hold Engine</a></li>
            <li><a href="#rush-section" className="hover:text-[#EDE8DD]">Queue Admission</a></li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="text-[#EDE8DD]/40 uppercase tracking-wider font-semibold">ARCHITECTURE</div>
          <ul className="space-y-2 text-[#EDE8DD]/70">
            <li><button onClick={onOpenArchitecture} className="hover:text-[#EDE8DD] flex items-center gap-1"><span>System Topology</span><ArrowUpRight className="w-3 h-3 text-[#FF4F1F]" /></button></li>
            <li><span className="text-[#EDE8DD]/40">Auth (Node.js/Prisma)</span></li>
            <li><span className="text-[#EDE8DD]/40">Payment (.NET/Razorpay)</span></li>
            <li><span className="text-[#EDE8DD]/40">Ledger (.NET/KurrentDB)</span></li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="text-[#EDE8DD]/40 uppercase tracking-wider font-semibold">LEGAL & SPECS</div>
          <ul className="space-y-2 text-[#EDE8DD]/70">
            <li><a href="#support-section" className="hover:text-[#EDE8DD]">Refund Policy §3.2</a></li>
            <li><span className="text-[#EDE8DD]/40">Zero-Scalper Bylaws</span></li>
            <li><span className="text-[#EDE8DD]/40">Razorpay RBI Escrow</span></li>
            <li><span className="text-[#EDE8DD]/40">ISO 27001 Compliance</span></li>
          </ul>
        </div>
      </div>

      {/* System Status and Version Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 border-t border-hairline-dark flex flex-col sm:flex-row items-center justify-between font-mono text-[11px] text-[#EDE8DD]/50 gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>TICKSY GATEWAY 8080 · RS256 AUTH ACTIVE · NO SERVICE DEGRADATION</span>
        </div>
        <div>
          TICKSY © 2026 · ALL TRANSACTIONS RECORDED IN MINOR UNITS (PAISE)
        </div>
      </div>

      {/* Giant Cropped Ticksy Wordmark Bleeding Off Bottom Edge */}
      <div className="select-none pointer-events-none text-center leading-none overflow-hidden opacity-5">
        <span className="font-serif text-[18vw] font-black text-[#EDE8DD] tracking-tighter block -mb-[6vw]">
          Ticksy
        </span>
      </div>
    </footer>
  );
};
