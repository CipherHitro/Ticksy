import type { EventItem, LedgerBalance, LedgerEntry, PaymentRecord, User, UserRole } from '../types';

const BASE_URL = ''; // Relative path, proxied by Vite directly to backend services

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  code?: string;
  message?: string;
  requestId?: string;
}

/**
 * Universal API fetcher with token and X-Request-Id injection
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('ticksy_access_token');
  const requestId = 'req_' + Math.random().toString(36).substring(2, 10);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        success: false,
        code: data?.code || `HTTP_${res.status}`,
        message: data?.message || res.statusText || 'Request failed',
        requestId: data?.requestId || requestId,
      };
    }

    return {
      success: true,
      data: data?.data ?? data,
      requestId: data?.requestId || requestId,
    };
  } catch (err: any) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      message: err.message || 'Network error / backend unreachable',
      requestId,
    };
  }
}

/* ================= AUTH API ================= */

export async function loginUser(email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
  const res = await apiFetch<any>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (res.success && res.data) {
    const token = res.data.accessToken || res.data.token;
    const user = res.data.user;
    if (token) {
      localStorage.setItem('ticksy_access_token', token);
    }
    return {
      success: true,
      data: { token, user },
      requestId: res.requestId,
    };
  }

  return {
    success: false,
    code: res.code || 'UNAUTHENTICATED',
    message: res.message || 'Invalid email or password',
    requestId: res.requestId,
  };
}

export async function registerUser(name: string, email: string, password: string, role: UserRole): Promise<ApiResponse<{ token: string; user: User }>> {
  const res = await apiFetch<any>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  });

  if (res.success && res.data) {
    const token = res.data.accessToken || res.data.token;
    const user = res.data.user;
    if (token) {
      localStorage.setItem('ticksy_access_token', token);
    }
    return {
      success: true,
      data: { token, user },
      requestId: res.requestId,
    };
  }

  return {
    success: false,
    code: res.code || 'REGISTRATION_FAILED',
    message: res.message || 'Registration failed',
    requestId: res.requestId,
  };
}

export async function getCurrentUser(): Promise<ApiResponse<User>> {
  const res = await apiFetch<any>('/api/v1/auth/me', { method: 'GET' });
  if (res.success && res.data) {
    const user = res.data.user || res.data;
    return {
      success: true,
      data: user,
      requestId: res.requestId,
    };
  }

  return {
    success: false,
    code: res.code || 'UNAUTHENTICATED',
    message: res.message || 'No active session',
    requestId: res.requestId,
  };
}

export async function logoutUser(): Promise<void> {
  await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('ticksy_access_token');
}

/* ================= BOOKING & INVENTORY API ================= */

export async function getEvents(): Promise<ApiResponse<EventItem[]>> {
  const res = await apiFetch<any[]>('/api/v1/bookings/events', { method: 'GET' });
  if (res.success && Array.isArray(res.data)) {
    const posterMap: Record<string, { subtitle: string; city: string; venue: string; genre: 'music' | 'tech' | 'comedy'; posterUrl: string }> = {
      'evt-001': {
        subtitle: 'India’s premier heavy metal and rock spectacle with 12 international acts',
        city: 'Bengaluru',
        venue: 'Jayamahal Palace Grounds',
        genre: 'music',
        posterUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
      },
      'evt-002': {
        subtitle: 'An intimate, stripped-back acoustic evening under the winter sky',
        city: 'Mumbai',
        venue: 'Phoenix Marketcity Amphitheatre, Kurla',
        genre: 'music',
        posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
      },
      'evt-003': {
        subtitle: 'Microservices, Event Sourcing, Consensus & Chaos Engineering in Production',
        city: 'Bengaluru',
        venue: 'BIEC Convention Hall 3',
        genre: 'tech',
        posterUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
      },
      'evt-004': {
        subtitle: 'Brand-new 90-minute stand-up solo. Strictly 18+.',
        city: 'Delhi',
        venue: 'Sirifort Auditorium, August Kranti Marg',
        genre: 'comedy',
        posterUrl: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=1200&q=80',
      },
      'evt-005': {
        subtitle: 'High-tech minimal maestro returns to Mumbai for an exclusive sunset session',
        city: 'Mumbai',
        venue: 'Mahalaxmi Racecourse Arena',
        genre: 'music',
        posterUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
      },
    };

    const events: EventItem[] = res.data.map((item) => {
      const meta = posterMap[item.id] || {
        subtitle: 'Official live ticketing event on Ticksy',
        city: 'India',
        venue: 'Main Arena',
        genre: 'music',
        posterUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
      };

      const startsAtDate = new Date(item.startsAt);
      const dateStr = startsAtDate.toISOString().split('T')[0];
      const timeStr = startsAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST';

      return {
        id: item.id,
        title: item.title,
        subtitle: meta.subtitle,
        city: meta.city,
        venue: meta.venue,
        date: dateStr,
        time: timeStr,
        genre: meta.genre,
        priceMinor: item.minPriceMinor,
        currency: item.currency || 'INR',
        availableSeats: item.availableSeats,
        totalSeats: item.totalSeats,
        posterUrl: meta.posterUrl,
        isFeatured: item.id === 'evt-001',
        isDropCountdown: item.id === 'evt-001',
        dropTime: `Live now · ${item.availableSeats} seats remaining`,
        tiers: (item.tiers || []).map((t: any) => ({
          id: t.tierId,
          name: t.name,
          priceMinor: t.priceMinor,
          currency: t.currency || 'INR',
          capacity: t.total,
          available: t.available,
        })),
      };
    });

    return { success: true, data: events, requestId: res.requestId };
  }

  return {
    success: false,
    code: res.code || 'FETCH_EVENTS_FAILED',
    message: res.message || 'Failed to fetch events from backend',
    requestId: res.requestId,
  };
}

export async function getEventSeats(eventId: string): Promise<ApiResponse<any>> {
  return apiFetch(`/api/v1/bookings/events/${eventId}/seats`, { method: 'GET' });
}

export async function createBookingHold(
  eventId: string,
  seats: Array<{ tierId: string; seatLabel: string }>
): Promise<ApiResponse<any>> {
  const idempotencyKey = 'idem_hold_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  return apiFetch('/api/v1/bookings', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ eventId, seats }),
  });
}

export async function confirmBookingDev(bookingId: string): Promise<ApiResponse<any>> {
  return apiFetch(`/api/v1/bookings/${bookingId}/confirm-dev`, { method: 'POST' });
}

export async function cancelBooking(bookingId: string): Promise<ApiResponse<any>> {
  return apiFetch(`/api/v1/bookings/${bookingId}/cancel`, { method: 'POST' });
}

export async function getUserBookings(): Promise<ApiResponse<any[]>> {
  return apiFetch<any[]>('/api/v1/bookings/me', { method: 'GET' });
}

/* ================= LEDGER API ================= */

export async function getLedgerBalance(): Promise<ApiResponse<LedgerBalance>> {
  return apiFetch<LedgerBalance>('/api/v1/ledger/me/balance', { method: 'GET' });
}

export async function getLedgerStatements(): Promise<ApiResponse<LedgerEntry[]>> {
  return apiFetch<LedgerEntry[]>('/api/v1/ledger/me/statement', { method: 'GET' });
}

export async function requestPayout(amountMinor: number): Promise<ApiResponse<{ payoutId: string; amountMinor: number }>> {
  const idempotencyKey = 'idemp_po_' + Date.now();
  return apiFetch<{ payoutId: string; amountMinor: number }>('/api/v1/ledger/me/payouts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ amountMinor }),
  });
}

export async function injectDevEvent(eventType: 'BookingConfirmed' | 'BookingRefunded', amountMinor: number): Promise<ApiResponse<any>> {
  return apiFetch('/api/v1/ledger/dev/events', {
    method: 'POST',
    body: JSON.stringify({ eventType, amountMinor }),
  });
}

/* ================= PAYMENT API ================= */

export async function verifyPayment(paymentId: string, razorpayPaymentId: string): Promise<ApiResponse<PaymentRecord>> {
  return apiFetch<PaymentRecord>(`/api/v1/payments/${paymentId}/verify`, {
    method: 'POST',
    body: JSON.stringify({
      razorpayPaymentId,
      razorpaySignature: 'simulated_sig_' + Date.now(),
    }),
  });
}

export async function refundPayment(paymentId: string, reason: string): Promise<ApiResponse<any>> {
  return apiFetch(`/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/* ================= MICROSERVICES HEALTH CHECK ================= */

export async function checkMicroserviceHealth(): Promise<{ gateway: boolean; auth: boolean; booking: boolean; ledger: boolean; payment: boolean }> {
  const check = async (url: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  };

  const [auth, booking, ledger, payment] = await Promise.all([
    check('/api/v1/auth/me'),
    check('/api/v1/bookings/events'),
    check('/api/v1/ledger/me/balance'),
    check('/api/v1/payments/health'),
  ]);

  return { gateway: true, auth, booking, ledger, payment };
}
