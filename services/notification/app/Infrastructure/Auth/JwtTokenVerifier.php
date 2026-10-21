<?php

declare(strict_types=1);

namespace App\Infrastructure\Auth;

use App\Domain\Auth\UserContext;
use App\Http\Exceptions\ApiException;
use Firebase\JWT\JWT;
use stdClass;
use Throwable;

class JwtTokenVerifier
{
    public function __construct(
        private readonly JwksService $jwksService
    ) {}

    public function verify(string $token): UserContext
    {
        // Check for basic token parts
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw ApiException::unauthenticated('Malformed JWT token structure');
        }

        // Decode header to check alg and kid
        $headerJson = base64_decode(strtr($parts[0], '-_', '+/'), true);
        if ($headerJson === false) {
            throw ApiException::unauthenticated('Invalid JWT header encoding');
        }

        $header = json_decode($headerJson, false);
        if (! $header instanceof stdClass || empty($header->alg)) {
            throw ApiException::unauthenticated('Missing JWT algorithm');
        }

        // Explicit algorithm allowlist: ONLY RS256
        if ($header->alg !== 'RS256') {
            throw ApiException::unauthenticated("Unsupported JWT algorithm '{$header->alg}', only RS256 is allowed");
        }

        if (empty($header->kid) || ! is_string($header->kid)) {
            throw ApiException::unauthenticated('Missing JWT key ID (kid)');
        }

        try {
            $key = $this->jwksService->getKey($header->kid);
        } catch (Throwable $e) {
            throw ApiException::unauthenticated('Invalid or unknown key ID: '.$e->getMessage());
        }

        // Set clock leeway (max 30 seconds)
        JWT::$leeway = (int) config('notification.jwt.leeway', 30);

        try {
            /** @var stdClass $payload */
            $payload = JWT::decode($token, $key);
        } catch (Throwable $e) {
            throw ApiException::unauthenticated('JWT verification failed: '.$e->getMessage());
        }

        // Validate issuer and audience
        $expectedIssuer = (string) config('notification.jwt.issuer', 'ticksy-auth');
        $expectedAudience = (string) config('notification.jwt.audience', 'ticksy-api');

        if (! isset($payload->iss) || $payload->iss !== $expectedIssuer) {
            throw ApiException::unauthenticated('Invalid JWT issuer');
        }

        $audience = $payload->aud ?? null;
        $audMatch = false;
        if (is_string($audience) && $audience === $expectedAudience) {
            $audMatch = true;
        } elseif (is_array($audience) && in_array($expectedAudience, $audience, true)) {
            $audMatch = true;
        }

        if (! $audMatch) {
            throw ApiException::unauthenticated('Invalid JWT audience');
        }

        if (empty($payload->sub) || ! is_string($payload->sub)) {
            throw ApiException::unauthenticated('Missing subject (sub) claim in JWT');
        }

        $role = $payload->role ?? 'ATTENDEE';
        if (! in_array($role, ['ATTENDEE', 'ORGANIZER', 'ADMIN'], true)) {
            throw ApiException::unauthenticated("Invalid user role '{$role}' in JWT");
        }

        return new UserContext(
            userId: (string) $payload->sub,
            email: (string) ($payload->email ?? ''),
            name: (string) ($payload->name ?? ''),
            role: (string) $role,
        );
    }
}
