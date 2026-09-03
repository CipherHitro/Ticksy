import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';

// Refresh tokens live in an httpOnly cookie (not returned in the JSON
// body) - this protects them from being stolen via XSS, since JS in the
// browser can't read httpOnly cookies. Access tokens ARE returned in the
// body since the frontend needs to attach them to Authorization headers.
const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};

function sessionMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
}

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, tokens } = await authService.register(req.body, sessionMeta(req));
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(201).json({ success: true, data: { user, accessToken: tokens.accessToken } });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, tokens } = await authService.login(req.body, sessionMeta(req));
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(200).json({ success: true, data: { user, accessToken: tokens.accessToken } });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const oldToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!oldToken) throw new AppError('No refresh token provided', 401);

    const tokens = await authService.refreshTokens(oldToken, sessionMeta(req));
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(200).json({ success: true, data: { accessToken: tokens.accessToken } });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    res.status(200).json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

// Simple "who am I" endpoint - other services call this pattern for a
// quick sanity check, and frontends call it on app load to restore session.
export async function meHandler(req: Request, res: Response) {
  res.status(200).json({ success: true, data: { user: req.user } });
}
