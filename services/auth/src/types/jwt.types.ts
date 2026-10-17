import type { Role } from '@prisma/client';

/**
 * Claims present inside every access token (verified by all services).
 * Identity always comes from `sub`. `email` and `name` are for display/
 * denormalization only – never use them as auth identifiers.
 */
export interface AccessTokenPayload {
  sub:   string; // userId (UUID)
  email: string;
  name:  string;
  role:  Role;   // ATTENDEE | ORGANIZER | ADMIN
}
