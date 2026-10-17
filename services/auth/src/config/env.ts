import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // RS256 key paths – only Auth ever holds the private key
  JWT_PRIVATE_KEY_PATH: z.string().min(1, 'JWT_PRIVATE_KEY_PATH is required'),
  JWT_PUBLIC_KEY_PATH: z.string().min(1, 'JWT_PUBLIC_KEY_PATH is required'),
  JWT_KEY_ID: z.string().min(1, 'JWT_KEY_ID is required'),

  // Standard JWT claims
  JWT_ISSUER: z.string().default('ticksy-auth'),
  JWT_AUDIENCE: z.string().default('ticksy-api'),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900), // 15 minutes
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // intentionally using console.error here because pino isn't initialised yet
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
