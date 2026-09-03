import express from 'express';
import { prisma } from './config/prisma.js';
import { errorHandler } from './middlewares/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './config/env.js';
export const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // required so the browser sends/receives the refresh-token cookie
  }),
);

// Basic liveness check - just confirms the process is up.
app.get('/health', (_req, res) => {
  res.status(200).json({ success: true, service: 'auth-service', status: 'ok' });
});

// Readiness check - confirms Prisma can actually talk to Postgres.
app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, database: 'connected' });
  } catch (err) {
    console.error('DB health check failed:', err);
    res.status(503).json({ success: false, database: 'unreachable' });
  }
});

app.use('/api/v1/auth', authRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use(errorHandler);