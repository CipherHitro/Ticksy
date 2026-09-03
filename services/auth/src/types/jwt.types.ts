import { Role } from '@prisma/client';

// This is the shape every other microservice will see once it verifies
export interface AccessTokenPayload {
  sub: string; // userId
  role: Role;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  tokenId: string; // matches RefreshToken.id in DB, lets us revoke it
}
