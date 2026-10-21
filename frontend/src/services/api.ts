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

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function loginUser(email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
  const res = await apiFetch<any>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (res.success && res.data) {
    const rawData = res.data;
    const token = rawData.accessToken || rawData.token;
    const rawUser = rawData.user || rawData;
    const user: User = {
      id: rawUser.id || rawUser.sub || 'usr_' + Date.now(),
      email: rawUser.email || email,
      name: rawUser.name || email.split('@')[0],
      role: rawUser.role || 'ATTENDEE',
      createdAt: rawUser.createdAt,
    };

    if (token) {
      localStorage.setItem('ticksy_access_token', token);
      localStorage.setItem('ticksy_cached_user', JSON.stringify(user));
    }

    return {
      success: true,
      data: { token, user },
      requestId: res.requestId,
    };
  }

  // Return real backend error
  return {
    success: false,
    code: res.code || 'INVALID_CREDENTIALS',
    message: res.message || 'Login failed. Please check your credentials.',
    requestId: res.requestId,
  };
}

export async function registerUser(name: string, email: string, password: string, role: UserRole): Promise<ApiResponse<{ token: string; user: User }>> {
  const res = await apiFetch<any>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  });

  if (res.success && res.data) {
    const rawData = res.data;
    const token = rawData.accessToken || rawData.token;
    const rawUser = rawData.user || rawData;
    const user: User = {
      id: rawUser.id || rawUser.sub || 'usr_' + Date.now(),
      email: rawUser.email || email,
      name: rawUser.name || name,
      role: rawUser.role || role,
      createdAt: rawUser.createdAt,
    };

    if (token) {
      localStorage.setItem('ticksy_access_token', token);
      localStorage.setItem('ticksy_cached_user', JSON.stringify(user));
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
    message: res.message || 'Registration failed. Please check your inputs.',
    requestId: res.requestId,
  };
}

export async function getCurrentUser(): Promise<ApiResponse<User>> {
  const token = localStorage.getItem('ticksy_access_token');
  if (!token) {
    return {
      success: false,
      code: 'UNAUTHENTICATED',
      message: 'No active session',
    };
  }

  const res = await apiFetch<any>('/api/v1/auth/me', { method: 'GET' });
  if (res.success && res.data) {
    const raw = res.data.user || res.data;
    const user: User = {
      id: raw.id || raw.sub,
      email: raw.email,
      name: raw.name,
      role: raw.role,
      createdAt: raw.createdAt,
    };
    localStorage.setItem('ticksy_cached_user', JSON.stringify(user));
    return { success: true, data: user, requestId: res.requestId };
  }

  // Token might be expired or unverified
  if (res.code === 'UNAUTHENTICATED') {
    localStorage.removeItem('ticksy_access_token');
    localStorage.removeItem('ticksy_cached_user');
    return {
      success: false,
      code: 'UNAUTHENTICATED',
      message: res.message || 'Session expired',
      requestId: res.requestId,
    };
  }

  // Check cached user
  const saved = localStorage.getItem('ticksy_cached_user');
  if (saved) {
    try {
      return { success: true, data: JSON.parse(saved) };
    } catch {}
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
  const res = await apiFetch<any>('/api/v1/ledger/me/balance', { method: 'GET' });
  if (res.success && res.data) {
    const raw = res.data;
    const normalized: LedgerBalance = {
      organizerId: raw.organizerId || raw.OrganizerId || '',
      grossSalesMinor: raw.grossMinor ?? raw.GrossMinor ?? raw.grossSalesMinor ?? 0,
      platformFeesMinor: raw.feesMinor ?? raw.FeesMinor ?? raw.platformFeesMinor ?? 0,
      refundsMinor: raw.refundsGrossMinor ?? raw.RefundsGrossMinor ?? raw.refundsMinor ?? 0,
      payoutsMinor: raw.payoutsCompletedMinor ?? raw.PayoutsCompletedMinor ?? raw.payoutsMinor ?? 0,
      availableBalanceMinor: raw.availableBalanceMinor ?? raw.AvailableBalanceMinor ?? 0,
      currency: raw.currency || 'INR',
      asOf: raw.asOf || raw.AsOf || new Date().toISOString(),
    };
    inMemoryLedgerBalance = normalized;
    return { success: true, data: normalized, requestId: res.requestId };
  }
  return { success: true, data: { ...inMemoryLedgerBalance } };
}

export async function getLedgerStatements(): Promise<ApiResponse<LedgerEntry[]>> {
  const res = await apiFetch<any>('/api/v1/ledger/me/statement', { method: 'GET' });
  if (res.success && Array.isArray(res.data)) {
    const mapped: LedgerEntry[] = res.data.map((e: any) => {
      const rawType = e.type || e.Type || 'TICKET_SALE';
      let type: 'TICKET_SALE' | 'PLATFORM_FEE' | 'REFUND' | 'PAYOUT' = 'TICKET_SALE';
      if (rawType.includes('Refund')) type = 'REFUND';
      else if (rawType.includes('Payout')) type = 'PAYOUT';
      else if (rawType.includes('Fee')) type = 'PLATFORM_FEE';

      const gross = e.grossMinor ?? e.GrossMinor ?? 0;
      const net = e.netMinor ?? e.NetMinor;
      const amount = net !== undefined ? net : (type === 'REFUND' || type === 'PAYOUT' ? -gross : gross);

      return {
        id: e.id || e.Id || 'led_' + Math.random().toString(36).substring(2, 9),
        timestamp: e.occurredAt || e.OccurredAt ? new Date(e.occurredAt || e.OccurredAt).toLocaleString() : (e.timestamp || 'Just now'),
        type,
        amountMinor: amount,
        runningBalanceMinor: e.balanceAfterMinor ?? e.BalanceAfterMinor ?? 0,
        referenceId: (e.id || e.Id || '').substring(0, 8).toUpperCase() || 'REF',
        description: e.description || e.Description || 'Ledger entry',
      };
    });
    inMemoryLedgerEntries = mapped;
    return { success: true, data: mapped, requestId: res.requestId };
  }
  return { success: true, data: [...inMemoryLedgerEntries] };
}

export async function requestPayout(amountMinor: number): Promise<ApiResponse<{ payoutId: string; amountMinor: number }>> {
  const idempotencyKey = generateUUID();
  const res = await apiFetch<{ payoutId: string; amountMinor: number }>('/api/v1/ledger/me/payouts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ amountMinor }),
  });

  if (res.success && res.data) {
    return res;
  }

  // Fallback update in-memory state
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
  const userStr = localStorage.getItem('ticksy_cached_user');
  let organizerId = generateUUID();
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u.id && u.id.length > 10 && u.id.includes('-')) {
        organizerId = u.id;
      }
    } catch {}
  }

  const bookingId = generateUUID();
  const eventId = generateUUID();
  const paymentId = generateUUID();
  const refundId = generateUUID();

  const payload = eventType === 'BookingConfirmed'
    ? {
        bookingId,
        eventId,
        eventTitle: 'Dev Simulated Booking',
        organizerId,
        paymentId,
        totalAmountMinor: amountMinor,
        currency: 'INR',
      }
    : {
        bookingId,
        organizerId,
        refundId,
        refundAmountMinor: amountMinor,
        currency: 'INR',
      };

  const res = await apiFetch('/api/v1/ledger/dev/events', {
    method: 'POST',
    body: JSON.stringify({ eventType, payload }),
  });

  if (res.success) return res;

  // Local simulated ledger projection fallback
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

  // Booking & Catalog are using mock data until services are ready
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

/* ================= MY TICKETS API (Local / Booking Simulation) ================= */

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

export async function checkMicroserviceHealth(): Promise<{
  gateway: boolean;
  auth: boolean;
  ledger: boolean;
  payment: boolean;
  notification: boolean;
}> {
  const check = async (url: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      // Status < 500 means the microservice is reachable and actively responding via Gateway
      return res.status < 500;
    } catch {
      return false;
    }
  };

  const [gateway, auth, ledger, payment, notification] = await Promise.all([
    check('/health/ready'),
    check('/api/v1/auth/me'),
    check('/api/v1/ledger/me/balance'),
    check('/api/v1/payments/00000000-0000-0000-0000-000000000000'),
    check('/api/v1/notifications/dev/preview/welcome'),
  ]);

  return { gateway, auth, ledger, payment, notification };
}

