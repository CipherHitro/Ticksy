import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Upstream service URLs
  AUTH_URL: z.string().default('http://localhost:4001'),
  CATALOG_URL: z.string().default('http://localhost:4002'),
  BOOKING_URL: z.string().default('http://localhost:4003'),
  PAYMENT_URL: z.string().default('http://localhost:4004'),

  // RS256 JWKS public key verification
  AUTH_JWKS_URL: z.string().default('http://localhost:4001/.well-known/jwks.json'),
  JWT_ISSUER: z.string().default('ticksy-auth'),
  JWT_AUDIENCE: z.string().default('ticksy-api'),

  // CORS and Rate Limiting
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000), // 1 minute
  RATE_LIMIT_MAX: z.coerce.number().default(100),         // 100 req/window
  UPSTREAM_TIMEOUT_MS: z.coerce.number().default(10000),  // 10s
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Gateway environment validation failed:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
