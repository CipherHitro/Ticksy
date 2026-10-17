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
    id: 'booking-all',
    methods: ['*'],
    pathPattern: '/api/v1/bookings/**',
    regex: /^\/api\/v1\/bookings(\/.*)?$/,
    upstream: 'booking',
    authMode: 'required',
    roles: 'any',
    description: 'Generic booking operations (holds, checkout, confirmation)',
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
