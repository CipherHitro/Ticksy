import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider } from './services/authContext';
import { Navbar } from './components/common/Navbar';
import { HeroSection } from './components/landing/HeroSection';
import { EventDrops } from './components/landing/EventDrops';
import { FAQSection } from './components/landing/FAQSection';
import { Footer } from './components/common/Footer';
import { AuthModal } from './components/auth/AuthModal';
import { CreateEventModal } from './components/organizer/CreateEventModal';
import { EventDetailModal } from './components/booking/EventDetailModal';
import { CheckoutModal } from './components/booking/CheckoutModal';
import { MyTicketsModal } from './components/booking/MyTicketsModal';
import { OrganizerDashboard } from './components/organizer/OrganizerDashboard';
import { getEvents } from './services/api';
import type { EventItem, Seat, Ticket } from './types';

const MainApp: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [checkoutData, setCheckoutData] = useState<{ event: EventItem; seats: Seat[] } | null>(null);
  const [isMyTicketsOpen, setIsMyTicketsOpen] = useState(false);
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);

  const fetchEvents = useCallback(() => {
    getEvents().then((res) => {
      if (res.success && res.data) {
        setEvents(res.data);
      }
    });
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleScrollToDrops = () => {
    const el = document.getElementById('drops-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCheckoutSuccess = (_ticket: Ticket) => {
    fetchEvents();
    window.dispatchEvent(new CustomEvent('ticksy:booking_updated'));
  };

  return (
    <div className="min-h-screen bg-[#0B0A08] text-[#EDE8DD] font-sans antialiased selection:bg-[#FF4F1F] selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onOpenMyTickets={() => setIsMyTicketsOpen(true)}
        onOpenOrganizer={() => setIsOrganizerOpen(true)}
        onOpenCreateEvent={() => setIsCreateEventOpen(true)}
        onBrowseEvents={handleScrollToDrops}
      />

      <main>
        {/* Section 1: Hero */}
        <HeroSection
          onBrowseEvents={handleScrollToDrops}
          onOpenCreateEvent={() => setIsCreateEventOpen(true)}
          onOpenMyTickets={() => setIsMyTicketsOpen(true)}
        />

        {/* Section 2: Live Events Section (Dynamic) */}
        <EventDrops
          events={events}
          onSelectEvent={(evt) => setSelectedEvent(evt)}
          onOpenCreateEvent={() => setIsCreateEventOpen(true)}
        />

        {/* Section 3: Frequently Asked Questions */}
        <FAQSection />
      </main>

      {/* Footer */}
      <Footer
        onBrowseEvents={handleScrollToDrops}
        onOpenOrganizer={() => setIsOrganizerOpen(true)}
      />

      {/* Modals & Dialogs */}
      <AuthModal />

      <CreateEventModal
        isOpen={isCreateEventOpen}
        onClose={() => setIsCreateEventOpen(false)}
        onEventCreated={fetchEvents}
      />

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
