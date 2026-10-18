// ── Endpoints/GlobalExceptionHandler.cs ─────────────────────────────────────
// Catches every unhandled exception and maps it to the standard error envelope.
// Registered with app.UseExceptionHandler() in Program.cs.
using Microsoft.AspNetCore.Diagnostics;
using System.Text.Json;

namespace Ticksy.Payment.Api.Endpoints;

internal sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var requestId = httpContext.TraceIdentifier;

        logger.LogError(exception, "Unhandled exception on {RequestId}", requestId);

        var (status, code, message) = exception switch
        {
            UnauthorizedAccessException => (401, "UNAUTHENTICATED", "Authentication required"),
            KeyNotFoundException        => (404, "NOT_FOUND",       "Resource not found"),
            InvalidOperationException e => (409, "CONFLICT",        e.Message),
            _                          => (500, "INTERNAL_ERROR",   "An unexpected error occurred")
        };

        httpContext.Response.StatusCode  = status;
        httpContext.Response.ContentType = "application/json";

        var envelope = new ErrorEnvelope(false, code, message, requestId);
        await httpContext.Response.WriteAsync(
            JsonSerializer.Serialize(envelope, JsonOptions.Default), cancellationToken);

        return true;
    }
}

// Shared JSON options so the error handler uses the same serialization
// settings as the rest of the app (camelCase, string enums).
internal static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}
