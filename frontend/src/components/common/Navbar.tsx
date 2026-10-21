import React, { useState, useEffect } from 'react';
import { useAuth } from '../../services/authContext';
import { Ticket, LogOut, LayoutDashboard } from 'lucide-react';

interface NavbarProps {
  onOpenMyTickets: () => void;
  onOpenOrganizer: () => void;
  onOpenArchitecture: () => void;
  onBrowseEvents: () => void;
  onScrollToSection: (sectionId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenMyTickets,
  onOpenOrganizer,
  onOpenArchitecture,
  onBrowseEvents,
  onScrollToSection,
}) => {
  const { user, logout, openAuthModal, quickLogin } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

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
        {/* Brand Wordmark in Instrument Serif with notch */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2 group text-left"
          >
            <div className="relative flex items-center justify-center w-7 h-7 bg-[#EDE8DD] text-[#0B0A08] font-serif font-black text-xl rounded-[2px] overflow-hidden">
              <span>T</span>
              {/* Notched cut into T */}
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#0B0A08]" />
            </div>
            <span className="font-serif text-2xl tracking-tight text-[#EDE8DD] group-hover:text-white transition-colors">
              Ticksy
            </span>
          </button>

          {/* Microservice live indicator pill */}
          <button
            onClick={onOpenArchitecture}
            className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#EDE8DD]/5 border border-hairline-dark font-mono text-[10px] text-[#EDE8DD]/70 hover:text-[#EDE8DD] hover:bg-[#EDE8DD]/10 transition-colors"
            title="Inspect Microservices Topology (Auth, Gateway, Payment, Ledger)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>TOPOLOGY · 4 SERVICES</span>
          </button>
        </div>

        {/* Center Editorial Links */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-sans text-[#EDE8DD]/70">
          <button
            onClick={() => onScrollToSection('drops-section')}
            className="hover:text-[#EDE8DD] transition-colors"
          >
            Events
          </button>
          <button
            onClick={() => onScrollToSection('try-seat-section')}
            className="hover:text-[#EDE8DD] transition-colors"
          >
            Try a Seat
          </button>
          <button
            onClick={() => onScrollToSection('rush-section')}
            className="hover:text-[#EDE8DD] transition-colors"
          >
            Waiting Room
          </button>
          <button
            onClick={() => onScrollToSection('ledger-section')}
            className="hover:text-[#EDE8DD] transition-colors"
          >
            Ledger
          </button>
          <button
            onClick={() => onScrollToSection('support-section')}
            className="hover:text-[#EDE8DD] transition-colors"
          >
            Support RAG
          </button>
          <button
            onClick={() => onScrollToSection('faq-section')}
            className="hover:text-[#EDE8DD] transition-colors"
          >
            FAQ
          </button>
        </nav>

        {/* Right Action Bar */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              {/* My tickets button */}
              <button
                onClick={onOpenMyTickets}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-[2px] bg-[#EDE8DD]/10 hover:bg-[#EDE8DD]/20 border border-hairline-dark text-[#EDE8DD] transition-colors"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>My Tickets</span>
              </button>

              {/* Organizer Ledger button */}
              {(user.role === 'ORGANIZER' || user.role === 'ADMIN') && (
                <button
                  onClick={onOpenOrganizer}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-[2px] bg-[#B8975A]/20 hover:bg-[#B8975A]/30 border border-[#B8975A]/40 text-[#EDE8DD] transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-[#B8975A]" />
                  <span>Ledger Hub</span>
                </button>
              )}

              {/* User menu / Role Switcher */}
              <div className="relative">
                <button
                  onClick={() => setShowRoleMenu(!showRoleMenu)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-[2px] border border-hairline-dark bg-[#14120E] text-[#EDE8DD] hover:border-[#EDE8DD]/40"
                >
                  <span className="w-2 h-2 rounded-full bg-[#FF4F1F]" />
                  <span className="max-w-[100px] truncate">{user.name.split(' ')[0]}</span>
                  <span className="text-[10px] px-1 py-0.2 rounded-[2px] bg-[#EDE8DD]/10 text-[#EDE8DD]/60">
                    {user.role}
                  </span>
                </button>

                {showRoleMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-[2px] bg-[#161410] border border-hairline-dark p-2 shadow-2xl z-50 text-xs font-mono">
                    <div className="px-2 py-1.5 text-[#EDE8DD]/50 border-b border-hairline-dark mb-1">
                      CURRENT ROLE: <span className="text-[#FF4F1F] font-bold">{user.role}</span>
                    </div>
                    <div className="text-[10px] text-[#EDE8DD]/40 px-2 py-1 uppercase">Switch Role (Fast Demo)</div>
                    <button
                      onClick={() => { quickLogin('ATTENDEE'); setShowRoleMenu(false); }}
                      className="w-full text-left px-2 py-1.5 hover:bg-[#EDE8DD]/10 text-[#EDE8DD] rounded-[2px]"
                    >
                      Attendee (Fan)
                    </button>
                    <button
                      onClick={() => { quickLogin('ORGANIZER'); setShowRoleMenu(false); }}
                      className="w-full text-left px-2 py-1.5 hover:bg-[#EDE8DD]/10 text-[#B8975A] rounded-[2px]"
                    >
                      Organizer (Curator)
                    </button>
                    <button
                      onClick={() => { quickLogin('ADMIN'); setShowRoleMenu(false); }}
                      className="w-full text-left px-2 py-1.5 hover:bg-[#EDE8DD]/10 text-emerald-400 rounded-[2px]"
                    >
                      Admin (Superuser)
                    </button>
                    <div className="border-t border-hairline-dark my-1" />
                    <button
                      onClick={() => { logout(); setShowRoleMenu(false); }}
                      className="w-full text-left px-2 py-1.5 text-red-400 hover:bg-red-950/30 rounded-[2px] flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => openAuthModal('login')}
                className="text-xs font-mono text-[#EDE8DD]/70 hover:text-[#EDE8DD] transition-colors px-2 py-1"
              >
                Sign in
              </button>
              <button
                onClick={onBrowseEvents}
                className="px-4 py-1.5 bg-[#FF4F1F] hover:bg-[#FF4F1F]/90 text-white text-xs font-mono font-medium rounded-[2px] transition-colors border border-transparent shadow-sm"
              >
                Get tickets
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
