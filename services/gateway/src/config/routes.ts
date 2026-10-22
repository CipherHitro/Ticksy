import type { UpstreamService } from './upstreams.js';
import type { AuthMode, Role } from '../types/auth.types.js';

export interface RouteDefinition {
  id: string;
  methods: string[]; // HTTP methods or ['*'] for ANY
  pathPattern: string;
  regex: RegExp;
  upstream: UpstreamService;
  authMode: AuthMode;
  roles?: 'any' | Role[];
  description?: string;
}

/**
 * Gateway route table (ordered - first match wins).
 * Note: specific routes (like seat map) MUST precede generic wildcards.
 */
export const ROUTES: RouteDefinition[] = [
  // Auth public routes
  {
    id: 'auth-register-login',
    methods: ['POST'],
    pathPattern: '/api/v1/auth/(register|login)',
    regex: /^\/api\/v1\/auth\/(register|login)\/?$/,
    upstream: 'auth',
    authMode: 'public',
    description: 'User registration and login',
  },
  {
    id: 'auth-refresh-logout',
    methods: ['POST'],
    pathPattern: '/api/v1/auth/(refresh|logout)',
    regex: /^\/api\/v1\/auth\/(refresh|logout)\/?$/,
    upstream: 'auth',
    authMode: 'public',
    description: 'Refresh token rotation and session revocation via cookies',
  },
  {
    id: 'auth-me',
    methods: ['GET'],
    pathPattern: '/api/v1/auth/me',
    regex: /^\/api\/v1\/auth\/me\/?$/,
    upstream: 'auth',
    authMode: 'required',
    roles: 'any',
    description: 'Current user profile',
  },

  // Catalog routes
  {
    id: 'catalog-read',
    methods: ['GET'],
    pathPattern: '/api/v1/catalog/**',
    regex: /^\/api\/v1\/catalog(\/.*)?$/,
    upstream: 'catalog',
    authMode: 'optional',
    description: 'Catalog event listings and details (optional auth)',
  },
  {
    id: 'catalog-write',
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    pathPattern: '/api/v1/catalog/**',
    regex: /^\/api\/v1\/catalog(\/.*)?$/,
    upstream: 'catalog',
    authMode: 'required',
    roles: ['ORGANIZER', 'ADMIN'],
    description: 'Create, update, or delete catalog events (organizer/admin only)',
  },
  {
    id: 'catalog-graphql',
    methods: ['POST'],
    pathPattern: '/graphql',
    regex: /^\/graphql\/?$/,
    upstream: 'catalog',
    authMode: 'optional',
    description: 'Catalog GraphQL queries and mutations',
  },

  // Booking routes: Seat map comes BEFORE generic wildcard!
  {
    id: 'booking-seats-read',
    methods: ['GET'],
    pathPattern: '/api/v1/bookings/events/:id/seats',
    regex: /^\/api\/v1\/bookings\/events\/[^/]+\/seats\/?$/,
    upstream: 'booking',
    authMode: 'optional',
    description: 'Seat map view for attendees (optional auth)',
  },
  {
    id: 'booking-events-read',
    methods: ['GET'],
    pathPattern: '/api/v1/bookings/events',
    regex: /^\/api\/v1\/bookings\/events\/?$/,
    upstream: 'booking',
    authMode: 'optional',
    description: 'Public event listing from inventory (optional auth)',
  },
  {
    id: 'booking-all',
    methods: ['*'],
    pathPattern: '/api/v1/bookings/**',
    regex: /^\/api\/v1\/bookings(\/.*)?$/,
    upstream: 'booking',
    authMode: 'required',
    roles: 'any',
    description: 'Generic booking operations (holds, checkout, confirmation)',
  },

  // Payment routes: Webhook MUST be public and match before any wildcard
  {
    id: 'payment-webhook-razorpay',
    methods: ['POST'],
    pathPattern: '/api/v1/payments/webhooks/razorpay',
    regex: /^\/api\/v1\/payments\/webhooks\/razorpay\/?$/,
    upstream: 'payment',
    authMode: 'public',
    description: 'Razorpay payment webhooks (public, signature-verified)',
  },
  {
    id: 'payment-refund',
    methods: ['POST'],
    pathPattern: '/api/v1/payments/:id/refund',
    regex: /^\/api\/v1\/payments\/[^/]+\/refund\/?$/,
    upstream: 'payment',
    authMode: 'required',
    roles: ['ADMIN'],
    description: 'Refund a paid payment (ADMIN only)',
  },
  {
    id: 'payment-verify',
    methods: ['POST'],
    pathPattern: '/api/v1/payments/:id/verify',
    regex: /^\/api\/v1\/payments\/[^/]+\/verify\/?$/,
    upstream: 'payment',
    authMode: 'required',
    roles: 'any',
    description: 'Verify payment from client signature',
  },
  {
    id: 'payment-create',
    methods: ['POST'],
    pathPattern: '/api/v1/payments',
    regex: /^\/api\/v1\/payments\/?$/,
    upstream: 'payment',
    authMode: 'required',
    roles: 'any',
    description: 'Create a payment record and Razorpay order',
  },
  {
    id: 'payment-get',
    methods: ['GET'],
    pathPattern: '/api/v1/payments/:id',
    regex: /^\/api\/v1\/payments\/[^/]+\/?$/,
    upstream: 'payment',
    authMode: 'required',
    roles: 'any',
    description: 'Get payment status by ID',
  },

  // Ledger routes: /me (ORGANIZER/ADMIN) and /admin (ADMIN)
  {
    id: 'ledger-me',
    methods: ['*'],
    pathPattern: '/api/v1/ledger/me/**',
    regex: /^\/api\/v1\/ledger\/me(\/.*)?$/,
    upstream: 'ledger',
    authMode: 'required',
    roles: ['ORGANIZER', 'ADMIN'],
    description: 'Organizer ledger queries and payout requests',
  },
  {
    id: 'ledger-admin',
    methods: ['*'],
    pathPattern: '/api/v1/ledger/admin/**',
    regex: /^\/api\/v1\/ledger\/admin(\/.*)?$/,
    upstream: 'ledger',
    authMode: 'required',
    roles: ['ADMIN'],
    description: 'Admin ledger controls and projection rebuilds',
  },
  {
    id: 'ledger-dev',
    methods: ['*'],
    pathPattern: '/api/v1/ledger/dev/**',
    regex: /^\/api\/v1\/ledger\/dev(\/.*)?$/,
    upstream: 'ledger',
    authMode: 'public',
    description: 'Dev-only ledger event simulation endpoints',
  },

  // Notification routes: Webhook MUST be public and match before wildcards
  {
    id: 'notification-webhook-resend',
    methods: ['POST'],
    pathPattern: '/api/v1/notifications/webhooks/resend',
    regex: /^\/api\/v1\/notifications\/webhooks\/resend\/?$/,
    upstream: 'notification',
    authMode: 'public',
    description: 'Resend email status webhooks (public, Svix signature verified)',
  },
  {
    id: 'notification-me',
    methods: ['*'],
    pathPattern: '/api/v1/notifications/me/**',
    regex: /^\/api\/v1\/notifications\/me(\/.*)?$/,
    upstream: 'notification',
    authMode: 'required',
    roles: 'any',
    description: 'User notification history and preferences',
  },
  {
    id: 'notification-admin',
    methods: ['*'],
    pathPattern: '/api/v1/notifications/admin/**',
    regex: /^\/api\/v1\/notifications\/admin(\/.*)?$/,
    upstream: 'notification',
    authMode: 'required',
    roles: ['ADMIN'],
    description: 'Admin notification logs, retry, stats, and suppressions',
  },
  {
    id: 'notification-dev',
    methods: ['*'],
    pathPattern: '/api/v1/notifications/dev/**',
    regex: /^\/api\/v1\/notifications\/dev(\/.*)?$/,
    upstream: 'notification',
    authMode: 'public',
    description: 'Dev-only notification preview and test endpoints',
  },
];

/**
 * Match an incoming request against the route table (first match wins).
 */
export function matchRoute(method: string, path: string): RouteDefinition | undefined {
  const normalizedMethod = method.toUpperCase();
  for (const route of ROUTES) {
    const methodMatches = route.methods.includes('*') || route.methods.includes(normalizedMethod);
    if (methodMatches && route.regex.test(path)) {
      return route;
    }
  }
  return undefined;
}
