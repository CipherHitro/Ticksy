import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(100),
  // Only allow the two self-service roles here. ADMIN should never be
  // settable by the public signup endpoint - it gets promoted manually
  // or through a separate protected admin-only route.
  role: z.enum([Role.ATTENDEE, Role.ORGANIZER]).default(Role.ATTENDEE),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
