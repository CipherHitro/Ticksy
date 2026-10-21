<?php

declare(strict_types=1);

namespace App\Http\Exceptions;

use App\Http\Middleware\RequestIdMiddleware;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class ExceptionRenderer
{
    public static function render(Throwable $e, Request $request): Response
    {
        $requestId = (string) ($request->attributes->get('requestId') ?: RequestIdMiddleware::currentRequestId());

        $statusCode = 500;
        $errorCode = 'INTERNAL_ERROR';
        $message = 'An unexpected error occurred';
        $details = null;

        if ($e instanceof ApiException) {
            $statusCode = $e->getStatusCode();
            $errorCode = $e->getErrorCode();
            $message = $e->getMessage();
            $details = $e->getDetails();
        } elseif ($e instanceof ValidationException) {
            $statusCode = 400; // AGENTS.md rule: 400, not 422
            $errorCode = 'VALIDATION_ERROR';
            $message = $e->getMessage();
            $formattedDetails = [];
            foreach ($e->errors() as $field => $messages) {
                foreach ($messages as $msg) {
                    $formattedDetails[] = [
                        'field' => $field,
                        'message' => $msg,
                    ];
                }
            }
            $details = $formattedDetails;
        } elseif ($e instanceof AuthenticationException) {
            $statusCode = 401;
            $errorCode = 'UNAUTHENTICATED';
            $message = 'Unauthenticated';
        } elseif ($e instanceof AuthorizationException) {
            $statusCode = 403;
            $errorCode = 'FORBIDDEN';
            $message = 'Forbidden';
        } elseif ($e instanceof NotFoundHttpException) {
            $statusCode = 404;
            $errorCode = 'NOT_FOUND';
            $message = 'Resource not found';
        } elseif ($e instanceof MethodNotAllowedHttpException) {
            $statusCode = 405;
            $errorCode = 'METHOD_NOT_ALLOWED';
            $message = 'Method not allowed';
        } elseif ($e instanceof HttpExceptionInterface) {
            $statusCode = $e->getStatusCode();
            $message = $e->getMessage() ?: Response::$statusTexts[$statusCode] ?? 'Error';
            $errorCode = match ($statusCode) {
                400 => 'VALIDATION_ERROR',
                401 => 'UNAUTHENTICATED',
                403 => 'FORBIDDEN',
                404 => 'NOT_FOUND',
                405 => 'METHOD_NOT_ALLOWED',
                409 => 'CONFLICT',
                413 => 'PAYLOAD_TOO_LARGE',
                415 => 'UNSUPPORTED_MEDIA_TYPE',
                429 => 'RATE_LIMITED',
                502 => 'BAD_GATEWAY',
                503 => 'UPSTREAM_UNAVAILABLE',
                504 => 'UPSTREAM_TIMEOUT',
                default => 'INTERNAL_ERROR',
            };
        } else {
            // Unexpected 500 error
            Log::error('Unhandled exception: '.$e->getMessage(), [
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'requestId' => $requestId,
            ]);
        }

        $payload = [
            'success' => false,
            'code' => $errorCode,
            'message' => $message,
            'requestId' => $requestId,
        ];

        if ($details !== null) {
            $payload['details'] = $details;
        }

        return new JsonResponse($payload, $statusCode, [
            'X-Request-Id' => $requestId,
            'Content-Type' => 'application/json',
        ]);
    }
}
