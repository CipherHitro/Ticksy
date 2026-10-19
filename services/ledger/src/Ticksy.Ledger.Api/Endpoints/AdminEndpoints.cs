// ── Endpoints/AdminEndpoints.cs ───────────────────────────────────────────────
// Administrative routes under /api/v1/ledger/admin. Requires ADMIN role.
using Microsoft.AspNetCore.Mvc;
using Ticksy.Ledger.Api.Application;
using Ticksy.Ledger.Api.Auth;
using Ticksy.Ledger.Api.Domain;
using Ticksy.Ledger.Api.Infrastructure.Redis;

namespace Ticksy.Ledger.Api.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/ledger/admin")
                       .RequireAuthorization();

        // ── POST /complete payout ─────────────────────────────────────────────
        group.MapPost("/organizers/{organizerId:guid}/payouts/{payoutId:guid}/complete", async (
            Guid organizerId,
            Guid payoutId,
            HttpContext ctx,
            IAccountCommandHandler commandHandler,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsAdmin)
                return Problem("FORBIDDEN", "Admin access required", 403, ctx.TraceIdentifier);

            var cmd = new CompletePayout(organizerId, payoutId, new CommandMetadata(ctx.TraceIdentifier));
            var (state, _) = await commandHandler.HandleAsync(cmd, ct);

            return Results.Ok(new SuccessEnvelope<object>(true, new
            {
                payoutId,
                status = "COMPLETED",
                completedAt = DateTimeOffset.UtcNow
            }));
        });

        // ── POST /fail payout ─────────────────────────────────────────────────
        group.MapPost("/organizers/{organizerId:guid}/payouts/{payoutId:guid}/fail", async (
            Guid organizerId,
            Guid payoutId,
            [FromBody] FailPayoutBody body,
            HttpContext ctx,
            IAccountCommandHandler commandHandler,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsAdmin)
                return Problem("FORBIDDEN", "Admin access required", 403, ctx.TraceIdentifier);

            var reason = string.IsNullOrWhiteSpace(body.Reason) ? "Bank transfer rejected" : body.Reason;
            var cmd = new FailPayout(organizerId, payoutId, reason, new CommandMetadata(ctx.TraceIdentifier));
            var (state, _) = await commandHandler.HandleAsync(cmd, ct);

            return Results.Ok(new SuccessEnvelope<object>(true, new
            {
                payoutId,
                status = "FAILED",
                reason,
                returnedToAvailableBalance = state.AvailableBalanceMinor
            }));
        });

        // ── GET /organizer balance ────────────────────────────────────────────
        group.MapGet("/organizers/{organizerId:guid}/balance", async (
            Guid organizerId,
            HttpContext ctx,
            IRedisReadModelStore redisStore,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsAdmin)
                return Problem("FORBIDDEN", "Admin access required", 403, ctx.TraceIdentifier);

            var balance = await redisStore.GetBalanceAsync(organizerId);
            balance ??= new OrganizerBalance(organizerId, 0, 0, 0, 0, 0, 0, 0, 0, DateTimeOffset.UtcNow.ToString("O"));

            return Results.Ok(new SuccessEnvelope<OrganizerBalance>(true, balance));
        });

        // ── GET /platform/revenue ─────────────────────────────────────────────
        group.MapGet("/platform/revenue", async (
            [FromQuery] DateOnly? from,
            [FromQuery] DateOnly? to,
            HttpContext ctx,
            IRedisReadModelStore redisStore,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsAdmin)
                return Problem("FORBIDDEN", "Admin access required", 403, ctx.TraceIdentifier);

            var startDate = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-7));
            var endDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow);

            var revenue = await redisStore.GetPlatformRevenueAsync(startDate, endDate);
            return Results.Ok(new SuccessEnvelope<IReadOnlyList<PlatformRevenueSummary>>(true, revenue));
        });

        // ── POST /projections/rebuild ─────────────────────────────────────────
        group.MapPost("/projections/rebuild", async (
            HttpContext ctx,
            IRedisReadModelStore redisStore,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsAdmin)
                return Problem("FORBIDDEN", "Admin access required", 403, ctx.TraceIdentifier);

            await redisStore.RebuildAllAsync();

            return Results.Accepted(
                "/api/v1/ledger/admin/projections/status",
                new SuccessEnvelope<object>(true, new
                {
                    message = "Projections rebuild initiated. Redis read models cleared and checkpoint reset."
                }));
        });

        // ── GET /projections/status ───────────────────────────────────────────
        group.MapGet("/projections/status", async (
            HttpContext ctx,
            IRedisReadModelStore redisStore,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsAdmin)
                return Problem("FORBIDDEN", "Admin access required", 403, ctx.TraceIdentifier);

            var status = await redisStore.GetProjectionStatusAsync();
            return Results.Ok(new SuccessEnvelope<ProjectionStatus>(true, status));
        });

        return app;
    }

    private static IResult Problem(string code, string message, int status, string requestId) =>
        Results.Json(new ErrorEnvelope(false, code, message, requestId), statusCode: status);
}

public sealed record FailPayoutBody(string Reason);
