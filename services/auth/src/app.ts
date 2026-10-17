import express from 'express';
import { pinoHttp } from 'pino-http';
import type { Options as PinoHttpOptions } from 'pino-http';
import { prisma } from './config/prisma.js';
import { logger } from './config/logger.js';
import { requestIdMiddleware } from './middlewares/requestId.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import jwksRoutes from './routes/jwks.routes.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import type { IncomingMessage, ServerResponse } from 'http';

export const app = express();

// Trust the reverse proxy (gateway) for accurate client IPs used by rate limiting
app.set('trust proxy', 1);

// ──────────────────────────────────────────────────
// Middleware stack
// ──────────────────────────────────────────────────

// 1. Request ID – must be first so it flows into all subsequent logs/errors
app.use(requestIdMiddleware);

// 2. Structured HTTP logging with pino
const pinoHttpOpts: PinoHttpOptions = {
  logger,
  genReqId: (req: IncomingMessage): string => {
    return (req as express.Request).requestId ?? 'unknown';
  },
  customLogLevel(_req: IncomingMessage, res: ServerResponse) {
    if (res.statusCode >= 500) return 'error' as const;
    if (res.statusCode >= 400) return 'warn' as const;
    return 'info' as const;
  },
};
app.use(pinoHttp(pinoHttpOpts));

// 3. Security headers
app.use(helmet());

// 4. CORS – configured ONLY at Auth (other services rely on the gateway)
app.use(
  cors({
    origin:      env.CORS_ORIGIN,
    credentials: true, // required to send/receive the refreshToken cookie
  }),
);

// 5. Body parsing
app.use(express.json());
app.use(cookieParser());

// ──────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────

// JWKS endpoint at root – NOT under /api/v1 (internal service-to-service only)
app.use(jwksRoutes);

// Auth REST routes
app.use('/api/v1/auth', authRoutes);

// ──────────────────────────────────────────────────
// Health checks (not routed through the public gateway)
// ──────────────────────────────────────────────────

// Liveness – just confirms the process is up
app.get('/health/live', (_req, res) => {
  res.status(200).json({ success: true, service: 'auth', status: 'ok' });
});

// Readiness – confirms Prisma can talk to Postgres
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, service: 'auth', database: 'connected' });
  } catch (err) {
    logger.error({ err }, 'Readiness check failed');
    res.status(503).json({ success: false, service: 'auth', database: 'unreachable' });
  }
});

// ──────────────────────────────────────────────────
// Catch-all 404 and error handler
// ──────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    success:   false,
    code:      'NOT_FOUND',
    message:   `Route ${req.originalUrl} not found`,
    requestId: req.requestId,
  });
});

app.use(errorHandler);