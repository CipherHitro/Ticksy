import React, { useState, useEffect } from 'react';
import { useAuth } from '../../services/authContext';
import { Ticket, LogOut, LayoutDashboard, Plus, User as UserIcon } from 'lucide-react';

interface NavbarProps {
  onOpenMyTickets: () => void;
  onOpenOrganizer: () => void;
  onOpenCreateEvent: () => void;
  onBrowseEvents: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenMyTickets,
  onOpenOrganizer,
  onOpenCreateEvent,
  onBrowseEvents,
}) => {
  const { user, isOrganizer, logout, openAuthModal } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0B0A08]/90 backdrop-blur-md border-b border-hairline-dark py-3'
          : 'bg-[#0B0A08] border-b border-hairline-dark/50 py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2 group text-left"
          >
            <div className="relative flex items-center justify-center w-7 h-7 bg-[#EDE8DD] text-[#0B0A08] font-serif font-black text-xl rounded-[2px] overflow-hidden">
              <span>T</span>
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#0B0A08]" />
            </div>
            <span className="font-serif text-2xl tracking-tight text-[#EDE8DD] group-hover:text-white transition-colors">
              Ticksy
            </span>
          </button>
        </div>

        {/* Center Navigation Links (Clean & Role Aware) */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-sans text-[#EDE8DD]/70">
          <button
            onClick={onBrowseEvents}
            className="hover:text-[#EDE8DD] transition-colors"
          >
            Browse Events
          </button>

          {/* Only Organizer sees Organizer Ledger link */}
          {isOrganizer && (
            <button
              onClick={onOpenOrganizer}
              className="text-[#B8975A] hover:text-[#d1b06f] font-mono text-xs flex items-center gap-1.5 transition-colors"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Organizer Ledger</span>
            </button>
          )}
        </nav>

        {/* Right Action Bar */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              {/* If Organizer: "+ Create Event" button */}
              {isOrganizer ? (
                <button
                  onClick={onOpenCreateEvent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-[2px] bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white font-semibold transition-colors shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Event</span>
                </button>
              ) : (
                /* Attendee: My Tickets button */
                <button
                  onClick={onOpenMyTickets}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-[2px] bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 border border-hairline-dark text-[#EDE8DD] transition-colors"
                >
                  <Ticket className="w-3.5 h-3.5" />
                  <span>My Tickets</span>
                </button>
              )}

              {/* User badge */}
              <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#EDE8DD]/5 border border-hairline-dark rounded-[2px] font-mono text-xs text-[#EDE8DD]">
                <UserIcon className="w-3.5 h-3.5 text-[#EDE8DD]/60" />
                <span className="font-medium max-w-[120px] truncate">{user.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-[2px] font-bold ${
                  isOrganizer
                    ? 'bg-[#B8975A]/20 text-[#B8975A] border border-[#B8975A]/30'
                    : 'bg-[#EDE8DD]/10 text-[#EDE8DD]/70'
                }`}>
                  {user.role}
                </span>
              </div>

              {/* Logout button */}
              <button
                onClick={logout}
                className="p-1.5 rounded-[2px] text-[#EDE8DD]/60 hover:text-red-400 hover:bg-[#EDE8DD]/5 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAuthModal('login')}
                className="px-3.5 py-1.5 text-xs font-mono rounded-[2px] text-[#EDE8DD] hover:bg-[#EDE8DD]/5 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="px-3.5 py-1.5 text-xs font-mono font-semibold rounded-[2px] bg-[#FF4F1F] text-white hover:bg-[#FF4F1F]/90 transition-colors shadow"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
