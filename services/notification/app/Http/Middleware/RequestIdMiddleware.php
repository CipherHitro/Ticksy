<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class RequestIdMiddleware
{
    private static ?string $currentRequestId = null;

    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $request->header('X-Request-Id');
        if (empty($requestId) || ! is_string($requestId)) {
            $requestId = (string) Str::uuid();
        }

        self::$currentRequestId = $requestId;
        $request->attributes->set('requestId', $requestId);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Request-Id', $requestId);

        return $response;
    }

    public static function currentRequestId(): string
    {
        if (self::$currentRequestId !== null) {
            return self::$currentRequestId;
        }

        return (string) Str::uuid();
    }

    public static function setRequestId(?string $requestId): void
    {
        self::$currentRequestId = $requestId;
    }
}
