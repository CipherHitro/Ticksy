import React, { useState } from 'react';
import type { EventItem } from '../../types';
import { formatINR } from '../../utils/formatters';
import { Calendar, MapPin, ArrowUpRight } from 'lucide-react';

interface EventDropsProps {
  events: EventItem[];
  onSelectEvent: (event: EventItem) => void;
}

export const EventDrops: React.FC<EventDropsProps> = ({
  events,
  onSelectEvent,
}) => {
  const [cityFilter, setCityFilter] = useState<string>('All');
  const [genreFilter, setGenreFilter] = useState<string>('All');

  const filteredEvents = events.filter((evt) => {
    const cityMatch = cityFilter === 'All' || evt.city.toLowerCase() === cityFilter.toLowerCase();
    const genreMatch = genreFilter === 'All' || evt.genre.toLowerCase() === genreFilter.toLowerCase();
    return cityMatch && genreMatch;
  });

  return (
    <section id="drops-section" className="bg-[#EDE8DD] text-[#0B0A08] py-20 border-b border-hairline-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-[#0B0A08]/60 mb-2">
              CURATED ACCESS · FAIR QUEUES
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#0B0A08]">
              This week’s drops
            </h2>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[#0B0A08]/50 mr-1">CITY:</span>
            {['All', 'Mumbai', 'Bengaluru', 'Delhi', 'Ahmedabad'].map((city) => (
              <button
                key={city}
                onClick={() => setCityFilter(city)}
                className={`px-3 py-1 text-xs font-mono rounded-[2px] transition-colors border ${
                  cityFilter === city
                    ? 'bg-[#0B0A08] text-[#EDE8DD] border-[#0B0A08]'
                    : 'bg-transparent text-[#0B0A08]/70 border-[#0B0A08]/20 hover:border-[#0B0A08]/50'
                }`}
              >
                {city}
              </button>
            ))}

            <div className="w-px h-5 bg-[#0B0A08]/20 mx-2 hidden sm:block" />

            <span className="font-mono text-xs text-[#0B0A08]/50 mr-1 hidden sm:inline">GENRE:</span>
            {['All', 'music', 'tech', 'comedy'].map((genre) => (
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

        {/* Poster Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredEvents.map((event, idx) => {
            const isFirst = idx === 0 && cityFilter === 'All' && genreFilter === 'All';

            return (
              <div
                key={event.id}
                onClick={() => onSelectEvent(event)}
                className={`group cursor-pointer bg-[#F5F2EB] border border-[#0B0A08]/15 rounded-[3px] overflow-hidden flex flex-col justify-between transition-all duration-300 hover:border-[#0B0A08]/50 hover:shadow-xl relative ${
                  isFirst ? 'md:col-span-2 flex-col lg:flex-row' : ''
                }`}
              >
                {/* Physical Ticket Notches on poster card */}
                <div className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-6 rounded-full bg-[#EDE8DD] border border-[#0B0A08]/15 z-10" />
                <div className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-[#EDE8DD] border border-[#0B0A08]/15 z-10" />

                {/* Poster Imagery (4:5 or banner) */}
                <div className={`relative overflow-hidden ${isFirst ? 'lg:w-3/5 h-80 lg:h-auto' : 'h-72 w-full'}`}>
                  <img
                    src={event.posterUrl}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0A08]/80 via-transparent to-transparent opacity-80" />

                  {/* Stock urgency / Countdown pill */}
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-[#FF4F1F] text-white rounded-[2px] shadow-sm">
                      {event.availableSeats} LEFT
                    </span>
                    {event.isDropCountdown && (
                      <span className="font-mono text-xs px-2.5 py-1 bg-[#0B0A08]/90 text-[#EDE8DD] rounded-[2px] border border-hairline-dark">
                        {event.dropTime}
                      </span>
                    )}
                  </div>

                  {/* Serial number texture */}
                  <div className="absolute bottom-3 left-4 font-mono text-[10px] text-white/70 tracking-widest uppercase">
                    TKS-DROP-{event.id.slice(-3)}
                  </div>
                </div>

                {/* Card Editorial Details */}
                <div className={`p-6 flex-1 flex flex-col justify-between ${isFirst ? 'lg:w-2/5' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-[#0B0A08]/60 mb-2">
                      <span className="uppercase font-semibold tracking-wider">{event.genre}</span>
                      <span>{event.city}</span>
                    </div>

                    <h3 className="font-serif text-2xl sm:text-3xl font-normal leading-tight text-[#0B0A08] group-hover:text-[#FF4F1F] transition-colors mb-2">
                      {event.title}
                    </h3>

                    <p className="font-sans text-xs sm:text-sm text-[#0B0A08]/70 line-clamp-2 mb-4 leading-relaxed">
                      {event.subtitle}
                    </p>

                    <div className="space-y-1.5 font-mono text-xs text-[#0B0A08]/80">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-[#0B0A08]/50" />
                        <span>{event.date} · {event.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#0B0A08]/50" />
                        <span className="truncate">{event.venue}</span>
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

                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-3 py-1.5 bg-[#0B0A08] text-[#EDE8DD] group-hover:bg-[#FF4F1F] group-hover:text-white transition-colors rounded-[2px]">
                      <span>Reserve</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
