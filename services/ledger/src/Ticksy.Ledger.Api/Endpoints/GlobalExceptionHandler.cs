// ── Endpoints/GlobalExceptionHandler.cs ─────────────────────────────────────────
// Converts all unhandled exceptions into AGENTS.md § 5.4 error envelopes.
using Microsoft.AspNetCore.Diagnostics;
using Ticksy.Ledger.Api.Domain;

namespace Ticksy.Ledger.Api.Endpoints;

public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var requestId = httpContext.TraceIdentifier;

        if (exception is DomainException domainEx)
        {
            logger.LogWarning("Domain error: {Code} - {Message} (RequestId: {RequestId})",
                domainEx.Code, domainEx.Message, requestId);

            var statusCode = domainEx.Code switch
            {
                "UNSUPPORTED_CURRENCY"   => StatusCodes.Status400BadRequest,
                "VALIDATION_ERROR"       => StatusCodes.Status400BadRequest,
                "PAYOUT_NOT_FOUND"       => StatusCodes.Status404NotFound,
                "INSUFFICIENT_BALANCE"   => StatusCodes.Status409Conflict,
                "INVALID_PAYOUT_STATE"   => StatusCodes.Status409Conflict,
                "MINIMUM_PAYOUT_NOT_MET" => StatusCodes.Status400BadRequest,
                _                        => StatusCodes.Status400BadRequest
            };

            httpContext.Response.StatusCode = statusCode;
            httpContext.Response.ContentType = "application/json";

            var envelope = new ErrorEnvelope(
                Success: false,
                Code: domainEx.Code,
                Message: domainEx.Message,
                RequestId: requestId);

            await httpContext.Response.WriteAsJsonAsync(envelope, cancellationToken);
            return true;
        }

        logger.LogError(exception, "Unhandled server error (RequestId: {RequestId})", requestId);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        httpContext.Response.ContentType = "application/json";

        var genericEnvelope = new ErrorEnvelope(
            Success: false,
            Code: "INTERNAL_ERROR",
            Message: "An unexpected error occurred. Please try again later.",
            RequestId: requestId);

        await httpContext.Response.WriteAsJsonAsync(genericEnvelope, cancellationToken);
        return true;
    }
}
