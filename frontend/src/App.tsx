import React, { useState } from 'react';
import { AuthProvider, useAuth } from './services/authContext';
import { Navbar } from './components/common/Navbar';
import { HeroSection } from './components/landing/HeroSection';
import { ProofStrip } from './components/landing/ProofStrip';
import { EventDrops } from './components/landing/EventDrops';
import { WaitingRoomStory } from './components/landing/WaitingRoomStory';
import { TryASeatSection } from './components/landing/TryASeatSection';
import { TicketSection } from './components/landing/TicketSection';
import { LedgerSection } from './components/landing/LedgerSection';
import { SupportSection } from './components/landing/SupportSection';
import { FAQSection } from './components/landing/FAQSection';
import { Footer } from './components/common/Footer';
import { AuthModal } from './components/auth/AuthModal';
import { EventDetailModal } from './components/booking/EventDetailModal';
import { CheckoutModal } from './components/booking/CheckoutModal';
import { MyTicketsModal } from './components/booking/MyTicketsModal';
import { OrganizerDashboard } from './components/organizer/OrganizerDashboard';
import { ArchitectureModal } from './components/common/ArchitectureModal';
import { getEvents } from './services/api';
import type { EventItem, Seat, Ticket } from './types';

const MainApp: React.FC = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [checkoutData, setCheckoutData] = useState<{ event: EventItem; seats: Seat[] } | null>(null);
  const [isMyTicketsOpen, setIsMyTicketsOpen] = useState(false);
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);

  React.useEffect(() => {
    getEvents().then((res) => {
      if (res.success && res.data) {
        setEvents(res.data);
      }
    });
  }, []);

  const handleScrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleProceedFromTryASeat = (seats: Seat[]) => {
    const evt = events[0] || null;
    if (evt) {
      setCheckoutData({ event: evt, seats });
    }
  };

  const handleCheckoutSuccess = (_ticket: Ticket) => {
    // Keep checkout open so user views the generated ticket stub
  };

  return (
    <div className="min-h-screen bg-[#0B0A08] text-[#EDE8DD] font-sans antialiased selection:bg-[#FF4F1F] selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onOpenMyTickets={() => setIsMyTicketsOpen(true)}
        onOpenOrganizer={() => setIsOrganizerOpen(true)}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
        onBrowseEvents={() => handleScrollToSection('drops-section')}
        onScrollToSection={handleScrollToSection}
      />

      <main>
        {/* Section 2: Hero (Ink) */}
        <HeroSection
          onBrowseEvents={() => handleScrollToSection('drops-section')}
          onOpenOrganizer={() => {
            if (user?.role === 'ORGANIZER' || user?.role === 'ADMIN') {
              setIsOrganizerOpen(true);
            } else {
              handleScrollToSection('ledger-section');
            }
          }}
        />

        {/* Section 3: Proof strip (Bone) */}
        <ProofStrip />

        {/* Section 4: This week's drops (Bone) */}
        <EventDrops
          events={events}
          onSelectEvent={(evt) => setSelectedEvent(evt)}
        />

        {/* Section 5: The 7 PM rush: waiting room & seat hold (Ink) */}
        <WaitingRoomStory />

        {/* Section 6: Try a seat interactive map (Bone) */}
        <TryASeatSection
          event={events[0] || null}
          onProceedWithSeats={handleProceedFromTryASeat}
        />

        {/* Section 7: Your ticket stub (Ink) */}
        <TicketSection />

        {/* Section 8: Organizer Ledger showcase (Bone with Brass) */}
        <LedgerSection onOpenOrganizerDashboard={() => setIsOrganizerOpen(true)} />

        {/* Section 9: Ask Ticksy RAG support with citations (Ink) */}
        <SupportSection />

        {/* Section 10: FAQ (Bone) */}
        <FAQSection />
      </main>

      {/* Section 11: Final call & Footer (Ink) */}
      <Footer
        onBrowseEvents={() => handleScrollToSection('drops-section')}
        onOpenOrganizer={() => setIsOrganizerOpen(true)}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
      />

      {/* Modals & Dialogs */}
      <AuthModal />

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onProceedToCheckout={(event, seats) => {
          setSelectedEvent(null);
          setCheckoutData({ event, seats });
        }}
      />

      <CheckoutModal
        event={checkoutData?.event || null}
        seats={checkoutData?.seats || []}
        onClose={() => setCheckoutData(null)}
        onSuccess={handleCheckoutSuccess}
      />

      <MyTicketsModal
        isOpen={isMyTicketsOpen}
        onClose={() => setIsMyTicketsOpen(false)}
      />

      <OrganizerDashboard
        isOpen={isOrganizerOpen}
        onClose={() => setIsOrganizerOpen(false)}
      />

      <ArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
