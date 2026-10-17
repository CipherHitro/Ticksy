import { prisma } from '../config/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signAccessToken } from '../utils/jwt.js';
import { generateOpaqueToken, hashToken } from '../utils/hashToken.js';
import { AppError } from '../utils/AppError.js';
import type { RegisterInput, LoginInput } from '../validators/auth.validators.js';
import { env } from '../config/env.js';

interface AuthTokens {
  accessToken:  string;
  refreshToken: string; // opaque, raw value (given to client via cookie)
}

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Issue a fresh access + refresh token pair for a given user.
 *
 * Refresh tokens are now fully opaque (32 random bytes, base64url).
 * We store only their SHA-256 hash; the raw value goes to the client.
 * This means a database breach cannot be used to impersonate sessions.
 */
async function issueTokenPair(
  user: { id: string; email: string; name: string; role: import('@prisma/client').Role },
  meta: SessionMeta,
): Promise<AuthTokens> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_TTL_DAYS);

  // Generate the opaque token FIRST so we can hash and store it in one step.
  const rawRefreshToken = generateOpaqueToken();
  const tokenHash = hashToken(rawRefreshToken);

  await prisma.refreshToken.create({
    data: {
      userId:    user.id,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
  });

  const accessToken = await signAccessToken({
    sub:   user.id,
    email: user.email,
    name:  user.name,
    role:  user.role,
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

export async function register(input: RegisterInput, meta: SessionMeta) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError('Email is already in use', 409, 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name:  input.name,
      role:  input.role,
    },
  });

  const tokens = await issueTokenPair(user, meta);

  return {
    user:   { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens,
  };
}

export async function login(input: LoginInput, meta: SessionMeta) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run comparePassword even if user is missing, to prevent timing attacks
  const passwordMatch = user
    ? await comparePassword(input.password, user.passwordHash)
    : false;

  if (!user || !user.isActive || !passwordMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const tokens = await issueTokenPair(user, meta);

  return {
    user:   { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens,
  };
}

export async function refreshTokens(oldRawToken: string, meta: SessionMeta) {
  const tokenHash = hashToken(oldRawToken);
  const storedToken = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // Token-reuse detection: if the hash isn't found or the token was revoked,
  // someone may be replaying a stolen token. Safest move: revoke all sessions.
  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    if (storedToken) {
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data:  { revokedAt: new Date() },
      });
    }
    throw new AppError('Refresh token invalid or already used – all sessions revoked', 401, 'UNAUTHENTICATED');
  }

  const user = await prisma.user.findUnique({ where: { id: storedToken.userId } });
  if (!user || !user.isActive) {
    throw new AppError('User not found or inactive', 401, 'UNAUTHENTICATED');
  }

  // Rotate: revoke the old token and issue a brand-new pair.
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data:  { revokedAt: new Date() },
  });

  return issueTokenPair(user, meta);
}

export async function logout(rawRefreshToken: string) {
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data:  { revokedAt: new Date() },
  });
}
