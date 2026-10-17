import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { app } from '../app.js';
import { setRemoteJWKSet } from '../middlewares/authenticate.js';
import { setUpstreamOverride } from '../discovery/resolver.js';
import { getBreaker } from '../proxy/breaker.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

describe('Ticksy API Gateway Acceptance Tests', () => {
  let privateKey: CryptoKey | Uint8Array;
  let publicKey: CryptoKey | Uint8Array;
  let kid = 'test-key-1';
  let attendeeToken: string;
  let organizerToken: string;
  let adminToken: string;

  // Mock upstream servers
  let authServer: Server;
  let catalogServer: Server;

  beforeAll(async () => {
    // 1. Generate RSA key pair for testing
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;

    const jwk = await exportJWK(publicKey);
    jwk.kid = kid;
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    // Configure gateway to verify against our local test JWKS
    setRemoteJWKSet(createLocalJWKSet({ keys: [jwk] }) as any);

    // 2. Mint test tokens
    attendeeToken = await new SignJWT({
      email: 'attendee@ticksy.local',
      name: 'Alice Attendee',
      role: 'ATTENDEE',
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject('user-uuid-attendee')
      .setIssuer('ticksy-auth')
      .setAudience('ticksy-api')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    organizerToken = await new SignJWT({
      email: 'organizer@ticksy.local',
      name: 'Bob Organizer',
      role: 'ORGANIZER',
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject('user-uuid-organizer')
      .setIssuer('ticksy-auth')
      .setAudience('ticksy-api')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    adminToken = await new SignJWT({
      email: 'admin@ticksy.local',
      name: 'Charlie Admin',
      role: 'ADMIN',
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject('user-uuid-admin')
      .setIssuer('ticksy-auth')
      .setAudience('ticksy-api')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    // 3. Mock Upstream Services on dynamic ports
    await new Promise<void>((resolve) => {
      authServer = createServer((req, res) => {
        if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'refreshToken=dummy-opaque-cookie; Path=/api/v1/auth; HttpOnly',
          });
          res.end(JSON.stringify({ success: true, data: { accessToken: attendeeToken } }));
        } else if (req.url === '/api/v1/auth/me' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { user: 'me' } }));
        } else {
          res.writeHead(404);
          res.end();
        }
      }).listen(0, () => {
        const port = (authServer.address() as AddressInfo).port;
        setUpstreamOverride('auth', `http://127.0.0.1:${port}`);
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      catalogServer = createServer((req, res) => {
        if (req.url?.startsWith('/api/v1/catalog') && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: [{ id: 'event-1', title: 'Concert' }] }));
        } else if (req.url?.startsWith('/api/v1/catalog') && req.method === 'POST') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: { id: 'event-new', title: 'New Event' } }));
        } else {
          res.writeHead(404);
          res.end();
        }
      }).listen(0, () => {
        const port = (catalogServer.address() as AddressInfo).port;
        setUpstreamOverride('catalog', `http://127.0.0.1:${port}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    setUpstreamOverride('auth', null);
    setUpstreamOverride('catalog', null);
    await new Promise<void>((resolve) => authServer.close(() => resolve()));
    await new Promise<void>((resolve) => catalogServer.close(() => resolve()));
  });

  describe('Health endpoints', () => {
    it('GET /health/live returns 200 ok', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('ok');
    });

    it('GET /health/ready returns 200 ready', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('ready');
    });

    it('GET /health/upstreams shows breaker states', async () => {
      const res = await request(app).get('/health/upstreams');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.upstreams.auth.state).toBe('closed');
      expect(res.body.upstreams.catalog.state).toBe('closed');
      expect(res.body.upstreams.booking.state).toBe('closed');
    });
  });

  describe('Authentication & Authorization Enforcements', () => {
    it('Rule 1: A request with no token to a protected route returns 401 UNAUTHENTICATED', async () => {
      // /api/v1/auth/me is protected (authMode: required)
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('Rule 2: An ATTENDEE token on a catalog POST returns 403 FORBIDDEN', async () => {
      // POST /api/v1/catalog/** requires ORGANIZER or ADMIN
      const res = await request(app)
        .post('/api/v1/catalog/events')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ title: 'Illegal Event' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('ORGANIZER token on a catalog POST succeeds (coarse role authorization)', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ title: 'Legit Event' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('ADMIN token on a catalog POST succeeds', async () => {
      const res = await request(app)
        .post('/api/v1/catalog/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin Event' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('Public auth route /api/v1/auth/login works without any token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'attendee@ticksy.local', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Set-Cookie header must be preserved
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('Optional auth route /api/v1/catalog/events allows anonymous calls', async () => {
      const res = await request(app).get('/api/v1/catalog/events');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Optional auth route rejects malformed/invalid token with 401', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/events')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('Authenticated call to /api/v1/auth/me passes through', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('Trip breaker: when an upstream fails repeatedly, breaker opens and returns 503 UPSTREAM_UNAVAILABLE', async () => {
      const bookingBreaker = getBreaker('booking');

      // Booking upstream is not running (port 4003 is down), so requests fail with 502/network error
      // Fire requests to trip the breaker (volumeThreshold = 10, errorThreshold = 50%)
      for (let i = 0; i < 12; i++) {
        await request(app)
          .get('/api/v1/bookings/events/event-123/seats')
          .set('X-Request-Id', `test-breaker-${i}`);
      }

      // Breaker should now be OPEN
      expect(bookingBreaker.opened).toBe(true);

      // Next request to booking should immediately return 503 UPSTREAM_UNAVAILABLE with Retry-After
      const res = await request(app).get('/api/v1/bookings/events/event-123/seats');

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(res.headers['retry-after']).toBe('10');

      // Crucial: other upstreams (like Auth) must keep working!
      const authRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(authRes.status).toBe(200);
      expect(authRes.body.success).toBe(true);
    });
  });

  describe('Route Not Found', () => {
    it('Returns 404 NOT_FOUND in standard error envelope for unregistered routes', async () => {
      const res = await request(app).get('/api/v1/unknown-service/xyz');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.requestId).toBeDefined();
    });
  });
});
