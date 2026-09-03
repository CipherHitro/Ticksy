import { createHash } from 'crypto';

// Refresh tokens are already high-entropy (signed JWTs), so a fast SHA-256
// hash is appropriate here - unlike passwords, we don't need bcrypt's
// deliberate slowness. We only store the hash so that a database leak
// alone can't be used to impersonate a user.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
