/**
 * AppError – operational errors we deliberately surface to the caller.
 *
 * `code` maps to the UPPER_SNAKE_CASE codes defined in AGENTS.md §5.5.
 * Every error path that uses this class will produce the correct error
 * envelope: { success, code, message, requestId }.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code:       string;
  public readonly isOperational = true;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;

    // Derive a sensible default code from the HTTP status if none is given
    this.code = code ?? AppError.defaultCode(statusCode);

    Object.setPrototypeOf(this, AppError.prototype);
  }

  private static defaultCode(status: number): string {
    switch (status) {
      case 400: return 'VALIDATION_ERROR';
      case 401: return 'UNAUTHENTICATED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 429: return 'RATE_LIMITED';
      default:  return 'INTERNAL_ERROR';
    }
  }
}
