export type Role = 'ATTENDEE' | 'ORGANIZER' | 'ADMIN';

export type AuthMode = 'public' | 'optional' | 'required';

export interface JwtUserPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  iss: string;
  aud: string;
}
