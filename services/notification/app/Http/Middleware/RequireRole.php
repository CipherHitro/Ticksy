<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $userRole = $request->attributes->get('userRole');

        if (empty($userRole)) {
            throw ApiException::unauthenticated('Authentication required');
        }

        if (empty($roles)) {
            return $next($request);
        }

        // Check if user has any of the required roles
        if (! in_array($userRole, $roles, true)) {
            throw ApiException::forbidden("Access forbidden: role '{$userRole}' is not authorized for this resource");
        }

        return $next($request);
    }
}
