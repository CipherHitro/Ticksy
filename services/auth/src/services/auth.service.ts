import { prisma } from '../config/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { hashToken } from '../utils/hashToken.js';
import { AppError } from '../utils/AppError.js';
import type { RegisterInput, LoginInput } from '../validators/auth.validators.js';
import { env } from '../config/env.js';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

async function issueTokenPair(
  user: { id: string; email: string; role: import('@prisma/client').Role },
  meta: SessionMeta,
): Promise<AuthTokens> {
  // Create the refresh-token DB row first so we have an id to embed in the
  // JWT (tokenId) - this is what lets us revoke ONE session without
  // invalidating a user's other logged-in devices.
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_TTL_DAYS);

  const tokenRow = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: 'pending', // placeholder, updated below once token is signed
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
  });

  const refreshToken = signRefreshToken({ sub: user.id, tokenId: tokenRow.id });

  await prisma.refreshToken.update({
    where: { id: tokenRow.id },
    data: { tokenHash: hashToken(refreshToken) },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput, meta: SessionMeta) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
    },
  });

  const tokens = await issueTokenPair(user, meta);

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens,
  };
}

export async function login(input: LoginInput, meta: SessionMeta) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Deliberately vague message - don't reveal whether the email exists.
  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  const validPassword = await comparePassword(input.password, user.passwordHash);
  if (!validPassword) {
    throw new AppError('Invalid email or password', 401);
  }

  const tokens = await issueTokenPair(user, meta);

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens,
  };
}

export async function refreshTokens(oldRefreshToken: string, meta: SessionMeta) {
  let payload;
  try {
    payload = verifyRefreshToken(oldRefreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const tokenHash = hashToken(oldRefreshToken);
  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  // Token-reuse detection: if the token isn't found (or was already
  // revoked), someone may be replaying a stolen token. The safe move is
  // to revoke the whole family / all sessions for that user.
  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    if (storedToken) {
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new AppError('Refresh token invalid or reused - all sessions revoked', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw new AppError('User not found or inactive', 401);
  }

  // Rotate: revoke the old token, issue a brand new pair.
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair(user, meta);
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
