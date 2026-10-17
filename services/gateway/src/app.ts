import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { httpLogger } from './config/logger.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { globalRateLimiter } from './middlewares/rateLimit.js';
import { matchRoute } from './config/routes.js';
import { authenticateMiddleware } from './middlewares/authenticate.js';
import { authorizeMiddleware } from './middlewares/authorize.js';
import { forwardRequest } from './proxy/forward.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { healthRouter } from './routes/health.js';

export const app: express.Express = express();

// Trust reverse proxies (important for correct client IP detection)
app.set('trust proxy', 1);

// 1. Request ID (always first so all logs and responses carry it)
app.use(requestIdMiddleware);

// 2. Request Logger (JSON to stdout)
app.use(httpLogger);

// 3. Security Headers
app.use(helmet());

// 4. CORS (origins from CORS_ORIGINS, credentials: true)
const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Health check endpoints (exempt from global rate limits and auth)
app.use('/health', healthRouter);

// 5. Global Rate Limiter
app.use(globalRateLimiter);

// Capture raw body buffer without re-serializing (preserves webhooks & raw payloads)
app.use(
  express.raw({
    type: '*/*',
    limit: '10mb',
  })
);

// Store raw body buffer on request for proxy forwarding
app.use((req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
  }
  next();
});

// 6. Route Matcher (first match wins according to route table)
app.use((req, res, next) => {
  const matched = matchRoute(req.method, req.path);
  if (!matched) {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `No gateway route found matching ${req.method} ${req.path}`,
      requestId: req.requestId || 'unknown',
    });
    return;
  }
  req.matchedRoute = matched;
  next();
});

// 7. Authenticate (public / optional / required)
app.use(authenticateMiddleware);

// 8. Authorize Roles (coarse checks based on matchedRoute.roles)
app.use(authorizeMiddleware);

// 9. Forward to Upstream via Undici + Circuit Breaker
app.use(forwardRequest);

// 10. Centralized Error Mapper
app.use(errorHandler);
