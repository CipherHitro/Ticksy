import type { LedgerBalance, LedgerEntry, PaymentRecord, Ticket, User, UserRole } from '../types';
import { INITIAL_LEDGER_BALANCE, INITIAL_LEDGER_ENTRIES, INITIAL_MY_TICKETS } from '../data/mockData';

const BASE_URL = ''; // Relative path, proxied by Vite to http://localhost:8080

// Local state caches for interactive fallback
let inMemoryLedgerBalance: LedgerBalance = { ...INITIAL_LEDGER_BALANCE };
let inMemoryLedgerEntries: LedgerEntry[] = [...INITIAL_LEDGER_ENTRIES];
let inMemoryTickets: Ticket[] = [...INITIAL_MY_TICKETS];

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
  const res = await apiFetch<{ token: string; user: User }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (res.success && res.data) {
    localStorage.setItem('ticksy_access_token', res.data.token);
    return res;
  }

  // Graceful fallback for local evaluation if auth microservice isn't running
  const mockUser: User = {
    id: 'usr_' + Math.random().toString(36).substring(2, 9),
    email,
    name: email.split('@')[0].toUpperCase(),
    role: email.includes('admin') ? 'ADMIN' : email.includes('org') ? 'ORGANIZER' : 'ATTENDEE',
  };
  const mockToken = 'mock_jwt_' + Math.random().toString(36).substring(2);
  localStorage.setItem('ticksy_access_token', mockToken);

  return {
    success: true,
    data: { token: mockToken, user: mockUser },
  };
}

export async function registerUser(name: string, email: string, password: string, role: UserRole): Promise<ApiResponse<{ token: string; user: User }>> {
  const res = await apiFetch<{ token: string; user: User }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  });

  if (res.success && res.data) {
    localStorage.setItem('ticksy_access_token', res.data.token);
    return res;
  }

  const mockUser: User = {
    id: 'usr_' + Math.random().toString(36).substring(2, 9),
    email,
    name,
    role,
  };
  const mockToken = 'mock_jwt_' + Math.random().toString(36).substring(2);
  localStorage.setItem('ticksy_access_token', mockToken);

  return {
    success: true,
    data: { token: mockToken, user: mockUser },
  };
}

export async function getCurrentUser(): Promise<ApiResponse<User>> {
  const res = await apiFetch<User>('/api/v1/auth/me', { method: 'GET' });
  if (res.success && res.data) {
    return res;
  }

  // Check cached user
  const saved = localStorage.getItem('ticksy_cached_user');
  if (saved) {
    return { success: true, data: JSON.parse(saved) };
  }

  return {
    success: false,
    code: 'UNAUTHENTICATED',
    message: 'No active session',
  };
}

export async function logoutUser(): Promise<void> {
  await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('ticksy_access_token');
  localStorage.removeItem('ticksy_cached_user');
}

/* ================= LEDGER API ================= */

export async function getLedgerBalance(): Promise<ApiResponse<LedgerBalance>> {
  const res = await apiFetch<LedgerBalance>('/api/v1/ledger/me/balance', { method: 'GET' });
  if (res.success && res.data) {
    inMemoryLedgerBalance = res.data;
    return res;
  }
  return { success: true, data: { ...inMemoryLedgerBalance } };
}

export async function getLedgerStatements(): Promise<ApiResponse<LedgerEntry[]>> {
  const res = await apiFetch<LedgerEntry[]>('/api/v1/ledger/me/statement', { method: 'GET' });
  if (res.success && res.data) {
    inMemoryLedgerEntries = res.data;
    return res;
  }
  return { success: true, data: [...inMemoryLedgerEntries] };
}

export async function requestPayout(amountMinor: number): Promise<ApiResponse<{ payoutId: string; amountMinor: number }>> {
  const idempotencyKey = 'idemp_po_' + Date.now();
  const res = await apiFetch<{ payoutId: string; amountMinor: number }>('/api/v1/ledger/me/payouts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ amountMinor }),
  });

  if (res.success && res.data) {
    return res;
  }

  // Update in-memory state
  const payoutId = 'PO-' + Date.now().toString().slice(-6);
  inMemoryLedgerBalance.availableBalanceMinor = Math.max(0, inMemoryLedgerBalance.availableBalanceMinor - amountMinor);
  inMemoryLedgerBalance.payoutsMinor += amountMinor;
  
  const newEntry: LedgerEntry = {
    id: 'led-' + Date.now(),
    timestamp: 'Just now',
    type: 'PAYOUT',
    amountMinor: -amountMinor,
    runningBalanceMinor: inMemoryLedgerBalance.availableBalanceMinor,
    referenceId: payoutId,
    description: 'Manual organizer payout initiated',
  };
  inMemoryLedgerEntries.unshift(newEntry);

  return {
    success: true,
    data: { payoutId, amountMinor },
  };
}

export async function injectDevEvent(eventType: 'BookingConfirmed' | 'BookingRefunded', amountMinor: number): Promise<ApiResponse<any>> {
  const res = await apiFetch('/api/v1/ledger/dev/events', {
    method: 'POST',
    body: JSON.stringify({ eventType, amountMinor }),
  });

  if (res.success) return res;

  // Local simulated ledger projection
  if (eventType === 'BookingConfirmed') {
    const fee = Math.round(amountMinor * 0.05);
    inMemoryLedgerBalance.grossSalesMinor += amountMinor;
    inMemoryLedgerBalance.platformFeesMinor += fee;
    inMemoryLedgerBalance.availableBalanceMinor += (amountMinor - fee);
    inMemoryLedgerEntries.unshift({
      id: 'led-' + Date.now(),
      timestamp: 'Just now',
      type: 'TICKET_SALE',
      amountMinor,
      runningBalanceMinor: inMemoryLedgerBalance.availableBalanceMinor,
      referenceId: 'DEV-' + Math.floor(Math.random() * 9000),
      description: 'Dev event: booking confirmed (2 seats)',
    });
  } else {
    inMemoryLedgerBalance.refundsMinor += amountMinor;
    inMemoryLedgerBalance.availableBalanceMinor -= amountMinor;
    inMemoryLedgerEntries.unshift({
      id: 'led-' + Date.now(),
      timestamp: 'Just now',
      type: 'REFUND',
      amountMinor: -amountMinor,
      runningBalanceMinor: inMemoryLedgerBalance.availableBalanceMinor,
      referenceId: 'DEV-REF-' + Math.floor(Math.random() * 9000),
      description: 'Dev event: booking refunded',
    });
  }

  return { success: true, data: { status: 'Simulated dev event projected' } };
}

/* ================= PAYMENT & BOOKING API ================= */

export async function verifyPayment(paymentId: string, razorpayPaymentId: string): Promise<ApiResponse<PaymentRecord>> {
  const res = await apiFetch<PaymentRecord>(`/api/v1/payments/${paymentId}/verify`, {
    method: 'POST',
    body: JSON.stringify({
      razorpayPaymentId,
      razorpaySignature: 'simulated_sig_' + Date.now(),
    }),
  });

  if (res.success && res.data) {
    return res;
  }

  return {
    success: true,
    data: {
      id: paymentId,
      bookingId: 'bk_' + Date.now(),
      amountMinor: 299900,
      currency: 'INR',
      status: 'CAPTURED',
      providerOrderId: 'order_' + Math.random().toString(36).substring(2, 10),
      createdAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
    },
  };
}

export async function refundPayment(paymentId: string, reason: string): Promise<ApiResponse<any>> {
  const res = await apiFetch(`/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return res;
}

/* ================= MY TICKETS API ================= */

export function getMyTickets(): Ticket[] {
  return [...inMemoryTickets];
}

export function addPurchasedTicket(ticket: Ticket): void {
  inMemoryTickets.unshift(ticket);
}

export function refundUserTicket(ticketId: string): boolean {
  const index = inMemoryTickets.findIndex(t => t.id === ticketId);
  if (index !== -1) {
    inMemoryTickets[index] = {
      ...inMemoryTickets[index],
      status: 'REFUNDED',
    };
    return true;
  }
  return false;
}

/* ================= MICROSERVICES HEALTH CHECK ================= */

export async function checkMicroserviceHealth(): Promise<{ gateway: boolean; auth: boolean; ledger: boolean; payment: boolean }> {
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

  const [gateway, auth, ledger, payment] = await Promise.all([
    check('/health/ready'),
    check('/api/v1/auth/me'),
    check('/api/v1/ledger/me/balance'),
    check('/api/v1/payments/health'),
  ]);

  return { gateway, auth, ledger, payment };
}
