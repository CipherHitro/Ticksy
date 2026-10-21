<?php

declare(strict_types=1);

use App\Http\Exceptions\ExceptionRenderer;
use App\Http\Middleware\AuthenticateJwt;
use App\Http\Middleware\RequestIdMiddleware;
use App\Http\Middleware\RequireRole;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1/notifications',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->prepend(RequestIdMiddleware::class);
        $middleware->alias([
            'jwt.auth' => AuthenticateJwt::class,
            'role' => RequireRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (Throwable $e, Request $request) {
            return ExceptionRenderer::render($e, $request);
        });
    })->create();
