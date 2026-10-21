import React, { useState } from 'react';
import type { EventItem } from '../../types';
import { useAuth } from '../../services/authContext';
import { formatINR } from '../../utils/formatters';
import { Calendar, MapPin, ArrowUpRight, Plus, Sparkles } from 'lucide-react';

interface EventDropsProps {
  events: EventItem[];
  onSelectEvent: (event: EventItem) => void;
  onOpenCreateEvent: () => void;
}

export const EventDrops: React.FC<EventDropsProps> = ({
  events,
  onSelectEvent,
  onOpenCreateEvent,
}) => {
  const { isOrganizer } = useAuth();
  const [genreFilter, setGenreFilter] = useState<string>('All');

  const filteredEvents = events.filter((evt) => {
    return genreFilter === 'All' || evt.genre.toLowerCase() === genreFilter.toLowerCase();
  });

  return (
    <section id="drops-section" className="bg-[#EDE8DD] text-[#0B0A08] py-20 border-b border-hairline-light min-h-[500px]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-2">
              LIVE EVENTS · REAL-TIME SEATS
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0B0A08]">
              Upcoming Events
            </h2>
          </div>

          {/* Right Action: Filters + Create Event if Organizer */}
          <div className="flex flex-wrap items-center gap-3">
            {isOrganizer && (
              <button
                onClick={onOpenCreateEvent}
                className="px-4 py-2 bg-[#0B0A08] hover:bg-[#1a1814] text-[#EDE8DD] font-mono text-xs font-semibold rounded-[2px] transition-colors flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4 text-[#FF4F1F]" />
                <span>Publish Event</span>
              </button>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {['All', 'music', 'tech', 'comedy', 'workshop', 'theatre'].map((genre) => (
                <button
                  key={genre}
                  onClick={() => setGenreFilter(genre)}
                  className={`px-3 py-1 text-xs font-mono rounded-[2px] transition-colors border uppercase ${
                    genreFilter === genre
                      ? 'bg-[#0B0A08] text-[#EDE8DD] border-[#0B0A08]'
                      : 'bg-transparent text-[#0B0A08]/70 border-[#0B0A08]/20 hover:border-[#0B0A08]/50'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Events Grid */}
        {filteredEvents.length === 0 ? (
          <div className="p-12 sm:p-16 bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px] text-center max-w-2xl mx-auto my-8">
            <Sparkles className="w-8 h-8 text-[#FF4F1F] mx-auto mb-4" />
            <h3 className="font-serif text-2xl sm:text-3xl font-bold mb-2 text-[#0B0A08]">
              {events.length === 0 ? 'No Published Events Yet' : `No ${genreFilter} Events Found`}
            </h3>
            <p className="font-sans text-sm text-[#0B0A08]/70 mb-6 max-w-md mx-auto">
              {isOrganizer
                ? 'As an organizer, you can publish your first live event right now. It will instantly initialize ticket inventory and seat holds!'
                : 'There are currently no events matching this category. Please check back soon or switch filters!'}
            </p>
            {isOrganizer && (
              <button
                onClick={onOpenCreateEvent}
                className="px-6 py-3 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-mono text-xs font-bold rounded-[2px] inline-flex items-center gap-2 shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Create Your First Event</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => onSelectEvent(event)}
                className="group cursor-pointer bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px] overflow-hidden flex flex-col justify-between transition-all duration-300 hover:border-[#0B0A08]/50 hover:shadow-xl relative"
              >
                {/* Poster Imagery */}
                <div className="relative overflow-hidden h-64 w-full bg-[#0B0A08]">
                  <img
                    src={event.posterUrl}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0A08]/85 via-transparent to-transparent" />

                  {/* Category Pill */}
                  <div className="absolute top-3 left-3 bg-[#0B0A08]/80 backdrop-blur-sm border border-hairline-dark px-2.5 py-0.5 rounded-[2px] font-mono text-[10px] uppercase font-bold text-[#EDE8DD]">
                    {event.genre}
                  </div>

                  {/* Seat Availability Pill */}
                  <div className="absolute top-3 right-3 bg-[#0B0A08]/80 backdrop-blur-sm border border-hairline-dark px-2.5 py-0.5 rounded-[2px] font-mono text-[10px] text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{event.availableSeats} seats left</span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-serif text-2xl text-[#0B0A08] group-hover:text-[#FF4F1F] transition-colors line-clamp-1 mb-1">
                      {event.title}
                    </h3>

                    <p className="font-sans text-xs text-[#0B0A08]/70 line-clamp-2 mb-4 leading-relaxed">
                      {event.subtitle}
                    </p>

                    <div className="space-y-1.5 font-mono text-xs text-[#0B0A08]/70 border-t border-[#0B0A08]/10 pt-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-[#0B0A08]/50" />
                        <span>{event.date} · {event.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#0B0A08]/50" />
                        <span className="truncate">{event.venue}, {event.city}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#0B0A08]/15 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[10px] uppercase text-[#0B0A08]/50">PASSES FROM</div>
                      <div className="font-mono text-lg font-bold text-[#0B0A08] tabular-nums">
                        {formatINR(event.priceMinor)}
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-4 py-2 bg-[#0B0A08] text-[#EDE8DD] group-hover:bg-[#FF4F1F] group-hover:text-white transition-colors rounded-[2px] shadow-sm">
                      <span>Book Seats</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
