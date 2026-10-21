<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\Exceptions\ApiException;
use App\Infrastructure\Auth\JwtTokenVerifier;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateJwt
{
    public function __construct(
        private readonly JwtTokenVerifier $verifier
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $authHeader = $request->header('Authorization');

        if (empty($authHeader) || ! is_string($authHeader)) {
            throw ApiException::unauthenticated('Missing Authorization header');
        }

        if (! str_starts_with($authHeader, 'Bearer ')) {
            throw ApiException::unauthenticated('Invalid Authorization header format. Must be Bearer token');
        }

        $token = substr($authHeader, 7);
        if (empty(trim($token))) {
            throw ApiException::unauthenticated('Empty bearer token provided');
        }

        $userContext = $this->verifier->verify($token);

        $request->attributes->set('userContext', $userContext);
        $request->attributes->set('userId', $userContext->userId);
        $request->attributes->set('userEmail', $userContext->email);
        $request->attributes->set('userName', $userContext->name);
        $request->attributes->set('userRole', $userContext->role);

        return $next($request);
    }
}
