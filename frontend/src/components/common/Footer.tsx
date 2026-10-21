import React from 'react';
import { useAuth } from '../../services/authContext';

interface FooterProps {
  onBrowseEvents: () => void;
  onOpenOrganizer: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onBrowseEvents,
  onOpenOrganizer,
}) => {
  const { isOrganizer, openAuthModal, user } = useAuth();

  return (
    <footer className="bg-[#0B0A08] text-[#EDE8DD] border-t border-hairline-dark relative overflow-hidden paper-grain">
      {/* Final Call CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center relative z-10">
        <h2 className="font-serif text-5xl sm:text-6xl md:text-7xl text-[#EDE8DD] tracking-tight mb-4">
          Your seat is waiting.
        </h2>
        <p className="font-sans text-sm sm:text-base text-[#EDE8DD]/60 max-w-lg mx-auto mb-8 font-normal">
          Fair queues, guaranteed seat reservations, and zero double-bookings.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={onBrowseEvents}
            className="px-8 py-3.5 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-xs font-semibold rounded-[2px] transition-colors shadow-xl"
          >
            Find your event
          </button>
          {!user ? (
            <button
              onClick={() => openAuthModal('register')}
              className="px-8 py-3.5 bg-transparent hover:bg-[#EDE8DD]/10 text-[#EDE8DD] font-mono text-xs font-semibold rounded-[2px] border border-hairline-dark transition-colors"
            >
              Sign up free
            </button>
          ) : isOrganizer ? (
            <button
              onClick={onOpenOrganizer}
              className="px-8 py-3.5 bg-transparent hover:bg-[#EDE8DD]/10 text-[#B8975A] font-mono text-xs font-semibold rounded-[2px] border border-[#B8975A]/40 transition-colors"
            >
              Organizer Dashboard
            </button>
          ) : null}
        </div>
      </div>

      {/* Clean Link Columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-hairline-dark grid grid-cols-2 md:grid-cols-3 gap-8 font-mono text-xs">
        <div className="space-y-3">
          <div className="text-[#EDE8DD]/40 uppercase tracking-wider font-semibold">DISCOVER</div>
          <ul className="space-y-2 text-[#EDE8DD]/70">
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Music Concerts</button></li>
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Tech Summits</button></li>
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Stand-Up Comedy</button></li>
            <li><button onClick={onBrowseEvents} className="hover:text-[#EDE8DD]">Theatre & Workshops</button></li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="text-[#EDE8DD]/40 uppercase tracking-wider font-semibold">ORGANIZERS</div>
          <ul className="space-y-2 text-[#EDE8DD]/70">
            <li><button onClick={onOpenOrganizer} className="hover:text-[#EDE8DD]">Organizer Dashboard</button></li>
            <li><button onClick={onOpenOrganizer} className="hover:text-[#EDE8DD]">Sales & Statements</button></li>
            <li><button onClick={onOpenOrganizer} className="hover:text-[#EDE8DD]">Payout Requests</button></li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="text-[#EDE8DD]/40 uppercase tracking-wider font-semibold">SECURITY & POLICIES</div>
          <ul className="space-y-2 text-[#EDE8DD]/70">
            <li><span className="text-[#EDE8DD]/50">Zero Double-Booking Guarantee</span></li>
            <li><span className="text-[#EDE8DD]/50">Instant Refund Settlement</span></li>
            <li><span className="text-[#EDE8DD]/50">PCI-DSS Compliant Payments</span></li>
          </ul>
        </div>
      </div>

      {/* System Status and Version Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 border-t border-hairline-dark flex flex-col sm:flex-row items-center justify-between font-mono text-[11px] text-[#EDE8DD]/50 gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>TICKSY PLATFORM ACTIVE · SYSTEM NORMAL</span>
        </div>
        <div>
          TICKSY © 2026 · ALL RIGHTS RESERVED
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
