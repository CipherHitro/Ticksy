<?php

declare(strict_types=1);

namespace App\Http\Exceptions;

use Exception;
use Throwable;

class ApiException extends Exception
{
    /**
     * @param  array<int, array{field: string, message: string}>|null  $details
     */
    public function __construct(
        string $message,
        protected string $errorCode = 'INTERNAL_ERROR',
        protected int $statusCode = 500,
        protected ?array $details = null,
        ?Throwable $previous = null
    ) {
        parent::__construct($message, $statusCode, $previous);
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }

    /**
     * @return array<int, array{field: string, message: string}>|null
     */
    public function getDetails(): ?array
    {
        return $this->details;
    }

    public static function validation(string $message = 'Validation failed', ?array $details = null): self
    {
        return new self($message, 'VALIDATION_ERROR', 400, $details);
    }

    public static function unauthenticated(string $message = 'Unauthenticated'): self
    {
        return new self($message, 'UNAUTHENTICATED', 401);
    }

    public static function forbidden(string $message = 'Forbidden'): self
    {
        return new self($message, 'FORBIDDEN', 403);
    }

    public static function notFound(string $message = 'Resource not found', string $code = 'NOT_FOUND'): self
    {
        return new self($message, $code, 404);
    }

    public static function conflict(string $message = 'Conflict', string $code = 'CONFLICT'): self
    {
        return new self($message, $code, 409);
    }

    public static function upstreamUnavailable(string $message = 'Upstream service unavailable'): self
    {
        return new self($message, 'UPSTREAM_UNAVAILABLE', 503);
    }
}
