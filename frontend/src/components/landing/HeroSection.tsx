import React from 'react';
import { useAuth } from '../../services/authContext';
import { LiveSeatGrid } from './LiveSeatGrid';
import { ArrowRight, Ticket, Plus } from 'lucide-react';

interface HeroSectionProps {
  onBrowseEvents: () => void;
  onOpenCreateEvent: () => void;
  onOpenMyTickets: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onBrowseEvents,
  onOpenCreateEvent,
  onOpenMyTickets,
}) => {
  const { user, isOrganizer, openAuthModal } = useAuth();

  return (
    <section className="relative pt-32 pb-20 bg-[#0B0A08] text-[#EDE8DD] border-b border-hairline-dark overflow-hidden paper-grain">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column (7 cols): Editorial Typography */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[2px] bg-[#EDE8DD]/5 border border-hairline-dark font-mono text-xs text-[#EDE8DD]/70">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4F1F]" />
              <span>OFFICIAL EVENT TICKETING</span>
            </div>

            <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.98] tracking-tight text-[#EDE8DD]">
              Every seat.<br />
              Every rupee.<br />
              <span className="italic font-normal text-[#EDE8DD]">Accounted</span> for.
            </h1>

            <p className="font-sans text-lg md:text-xl text-[#EDE8DD]/70 max-w-xl font-normal leading-relaxed">
              Book live events with guaranteed seat holds and instant ticket passes. For organizers, publish events and track your real ticket sales in real-time.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              {/* Primary Action Button */}
              <button
                onClick={onBrowseEvents}
                className="px-6 py-3.5 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-sm font-semibold rounded-[2px] transition-all flex items-center gap-2 shadow-lg"
              >
                <span>Browse Events</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Role-based Secondary Action Button */}
              {isOrganizer ? (
                <button
                  onClick={onOpenCreateEvent}
                  className="px-6 py-3.5 bg-transparent hover:bg-[#EDE8DD]/10 text-[#B8975A] font-mono text-sm font-semibold rounded-[2px] border border-[#B8975A]/40 hover:border-[#B8975A] transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Publish New Event</span>
                </button>
              ) : user ? (
                <button
                  onClick={onOpenMyTickets}
                  className="px-6 py-3.5 bg-transparent hover:bg-[#EDE8DD]/10 text-[#EDE8DD] font-mono text-sm font-semibold rounded-[2px] border border-hairline-dark hover:border-[#EDE8DD]/40 transition-all flex items-center gap-2"
                >
                  <Ticket className="w-4 h-4" />
                  <span>My Booked Tickets</span>
                </button>
              ) : (
                <button
                  onClick={() => openAuthModal('register')}
                  className="px-6 py-3.5 bg-transparent hover:bg-[#EDE8DD]/10 text-[#EDE8DD] font-mono text-sm font-semibold rounded-[2px] border border-hairline-dark hover:border-[#EDE8DD]/40 transition-all flex items-center gap-2"
                >
                  <span>Sign In / Register</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): Live Stadium Grid */}
          <div className="lg:col-span-5 flex justify-center">
            <LiveSeatGrid />
          </div>
        </div>
      </div>
    </section>
  );
};
