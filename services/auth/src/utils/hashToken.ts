import { randomBytes } from 'crypto';
import { createHash } from 'crypto';

/**
 * Generate a cryptographically random opaque refresh token.
 * 32 bytes = 256 bits of entropy, base64url-encoded to keep it URL-safe.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash a refresh token with SHA-256 for safe storage.
 * Refresh tokens are high-entropy so bcrypt's slowness is unnecessary –
 * a fast SHA-256 is the right tool here. We only store the hash so that
 * a database leak alone cannot be used to impersonate a user.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
