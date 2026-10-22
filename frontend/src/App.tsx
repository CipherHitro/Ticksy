import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './services/authContext';
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
  const { user, openAuthModal } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [checkoutData, setCheckoutData] = useState<{ event: EventItem; seats: Seat[] } | null>(null);
  const [isMyTicketsOpen, setIsMyTicketsOpen] = useState(false);
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [initialTransferId, setInitialTransferId] = useState<string | null>(null);

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

  // Push modal state into browser history for deep linking & back button support
  const pushModal = (modalName: string, paramString: string) => {
    const url = `${window.location.pathname}${paramString}`;
    window.history.pushState({ modal: modalName }, '', url);
  };

  // Close modal with browser history back so forward/backward stack stays clean
  const closeModal = (closeFn: () => void) => {
    closeFn();
    const params = new URLSearchParams(window.location.search);
    if (params.get('modal') || params.get('action')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  // Browser Back Button & Popstate Listener: closes active modal instead of leaving app
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const modalParam = params.get('modal');
      const actionParam = params.get('action');

      if (!modalParam && !actionParam) {
        setIsMyTicketsOpen(false);
        setIsOrganizerOpen(false);
        setIsCreateEventOpen(false);
        setSelectedEvent(null);
        setCheckoutData(null);
      } else if (modalParam === 'my-tickets') {
        setIsMyTicketsOpen(true);
      } else if (modalParam === 'organizer') {
        setIsOrganizerOpen(true);
      } else if (modalParam === 'create-event') {
        setIsCreateEventOpen(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Parse Initial URL Deep-Link on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modalParam = params.get('modal');
    const actionParam = params.get('action');
    const transferIdParam = params.get('transferId');
    const eventIdParam = params.get('eventId');

    if (actionParam === 'accept-transfer' && transferIdParam) {
      setInitialTransferId(transferIdParam);
      if (user) {
        setIsMyTicketsOpen(true);
      } else {
        sessionStorage.setItem('ticksy_redirect', `accept-transfer:${transferIdParam}`);
        openAuthModal('login');
      }
    } else if (modalParam === 'my-tickets') {
      if (user) {
        setIsMyTicketsOpen(true);
      } else {
        sessionStorage.setItem('ticksy_redirect', 'my-tickets');
        openAuthModal('login');
      }
    } else if (modalParam === 'organizer') {
      if (user) {
        setIsOrganizerOpen(true);
      } else {
        sessionStorage.setItem('ticksy_redirect', 'organizer');
        openAuthModal('login');
      }
    } else if (modalParam === 'event' && eventIdParam) {
      const found = events.find((e) => e.id === eventIdParam);
      if (found) {
        setSelectedEvent(found);
      }
    }
  }, [user, events, openAuthModal]);

  // Auth Recovery: when user signs in, fulfill stored redirect
  useEffect(() => {
    if (user) {
      const redirect = sessionStorage.getItem('ticksy_redirect');
      if (redirect) {
        sessionStorage.removeItem('ticksy_redirect');
        if (redirect === 'my-tickets') {
          setIsMyTicketsOpen(true);
        } else if (redirect === 'organizer') {
          setIsOrganizerOpen(true);
        } else if (redirect.startsWith('accept-transfer:')) {
          const xferId = redirect.split(':')[1];
          setInitialTransferId(xferId);
          setIsMyTicketsOpen(true);
        }
      }
    }
  }, [user]);

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
        onOpenMyTickets={() => {
          pushModal('my-tickets', '?modal=my-tickets');
          setIsMyTicketsOpen(true);
        }}
        onOpenOrganizer={() => {
          pushModal('organizer', '?modal=organizer');
          setIsOrganizerOpen(true);
        }}
        onOpenCreateEvent={() => {
          pushModal('create-event', '?modal=create-event');
          setIsCreateEventOpen(true);
        }}
        onBrowseEvents={handleScrollToDrops}
      />

      <main>
        {/* Section 1: Hero */}
        <HeroSection
          onBrowseEvents={handleScrollToDrops}
          onOpenCreateEvent={() => {
            pushModal('create-event', '?modal=create-event');
            setIsCreateEventOpen(true);
          }}
          onOpenMyTickets={() => {
            pushModal('my-tickets', '?modal=my-tickets');
            setIsMyTicketsOpen(true);
          }}
        />

        {/* Section 2: Live Events Section (Dynamic) */}
        <EventDrops
          events={events}
          onSelectEvent={(evt) => {
            pushModal('event', `?modal=event&eventId=${evt.id}`);
            setSelectedEvent(evt);
          }}
          onOpenCreateEvent={() => {
            pushModal('create-event', '?modal=create-event');
            setIsCreateEventOpen(true);
          }}
        />

        {/* Section 3: Frequently Asked Questions */}
        <FAQSection />
      </main>

      {/* Footer */}
      <Footer
        onBrowseEvents={handleScrollToDrops}
        onOpenOrganizer={() => {
          pushModal('organizer', '?modal=organizer');
          setIsOrganizerOpen(true);
        }}
      />

      {/* Modals & Dialogs */}
      <AuthModal />

      <CreateEventModal
        isOpen={isCreateEventOpen}
        onClose={() => closeModal(() => setIsCreateEventOpen(false))}
        onEventCreated={fetchEvents}
      />

      <EventDetailModal
        event={selectedEvent}
        onClose={() => closeModal(() => setSelectedEvent(null))}
        onProceedToCheckout={(event, seats) => {
          setSelectedEvent(null);
          setCheckoutData({ event, seats });
        }}
      />

      <CheckoutModal
        event={checkoutData?.event || null}
        seats={checkoutData?.seats || []}
        onClose={() => closeModal(() => setCheckoutData(null))}
        onSuccess={handleCheckoutSuccess}
      />

      <MyTicketsModal
        isOpen={isMyTicketsOpen}
        initialTransferId={initialTransferId}
        onClose={() => {
          setInitialTransferId(null);
          closeModal(() => setIsMyTicketsOpen(false));
        }}
      />

      <OrganizerDashboard
        isOpen={isOrganizerOpen}
        onClose={() => closeModal(() => setIsOrganizerOpen(false))}
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
