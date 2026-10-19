// ── Endpoints/OrganizerEndpoints.cs ───────────────────────────────────────────
// Organizer-facing REST routes mounted under /api/v1/ledger/me.
// Organizer identity is taken strictly from JWT sub (never path params).
using Microsoft.AspNetCore.Mvc;
using Ticksy.Ledger.Api.Application;
using Ticksy.Ledger.Api.Auth;
using Ticksy.Ledger.Api.Domain;
using Ticksy.Ledger.Api.Infrastructure.Redis;

namespace Ticksy.Ledger.Api.Endpoints;

public static class OrganizerEndpoints
{
    public static IEndpointRouteBuilder MapOrganizerEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/ledger/me")
                       .RequireAuthorization();

        // ── GET /api/v1/ledger/me/balance ─────────────────────────────────────
        group.MapGet("/balance", async (
            HttpContext ctx,
            IRedisReadModelStore redisStore,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsOrganizer && !auth.IsAdmin)
                return Problem("FORBIDDEN", "Only organizers can access their balance", 403, ctx.TraceIdentifier);

            var balance = await redisStore.GetBalanceAsync(auth.UserId);

            // If empty, return zeroed balance with fresh timestamp
            balance ??= new OrganizerBalance(
                OrganizerId: auth.UserId,
                GrossMinor: 0,
                FeesMinor: 0,
                RefundsGrossMinor: 0,
                RefundsFeesMinor: 0,
                PayoutsPendingMinor: 0,
                PayoutsCompletedMinor: 0,
                NetEarningsMinor: 0,
                AvailableBalanceMinor: 0,
                AsOf: DateTimeOffset.UtcNow.ToString("O"));

            return Results.Ok(new SuccessEnvelope<OrganizerBalance>(true, balance));
        });

        // ── GET /api/v1/ledger/me/statement ───────────────────────────────────
        group.MapGet("/statement", async (
            [FromQuery] int page = 1,
            [FromQuery] int limit = 20,
            [FromQuery] DateTimeOffset? from = null,
            [FromQuery] DateTimeOffset? to = null,
            [FromQuery] string? type = null,
            HttpContext ctx = null!,
            IRedisReadModelStore redisStore = null!,
            CancellationToken ct = default) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsOrganizer && !auth.IsAdmin)
                return Problem("FORBIDDEN", "Access denied", 403, ctx.TraceIdentifier);

            if (limit is < 1 or > 50) limit = 20;
            if (page < 1) page = 1;

            var (entries, total) = await redisStore.GetStatementAsync(
                auth.UserId, page, limit, from, to, type);

            return Results.Ok(new SuccessEnvelope<IReadOnlyList<StatementEntry>>(
                true, entries, new { page, limit, total }));
        });

        // ── GET /api/v1/ledger/me/events ──────────────────────────────────────
        group.MapGet("/events", async (
            HttpContext ctx,
            IRedisReadModelStore redisStore,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsOrganizer && !auth.IsAdmin)
                return Problem("FORBIDDEN", "Access denied", 403, ctx.TraceIdentifier);

            var summaries = await redisStore.GetOrganizerEventsAsync(auth.UserId);
            return Results.Ok(new SuccessEnvelope<IReadOnlyList<EventSalesSummary>>(true, summaries));
        });

        // ── POST /api/v1/ledger/me/payouts ────────────────────────────────────
        group.MapPost("/payouts", async (
            [FromBody] RequestPayoutBody body,
            HttpContext ctx,
            IAccountCommandHandler commandHandler,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsOrganizer && !auth.IsAdmin)
                return Problem("FORBIDDEN", "Only organizers can request payouts", 403, ctx.TraceIdentifier);

            var payoutId = Guid.NewGuid();
            var idempotencyKey = ctx.Request.Headers["Idempotency-Key"].FirstOrDefault()
                              ?? Guid.NewGuid().ToString();

            var cmd = new RequestPayout(
                OrganizerId: auth.UserId,
                PayoutId: payoutId,
                AmountMinor: body.AmountMinor,
                Metadata: new CommandMetadata(ctx.TraceIdentifier, CorrelationId: idempotencyKey));

            var (state, events) = await commandHandler.HandleAsync(cmd, ct);

            return Results.Created(
                $"/api/v1/ledger/me/payouts/{payoutId}",
                new SuccessEnvelope<object>(true, new
                {
                    payoutId,
                    amountMinor = body.AmountMinor,
                    status = "PENDING",
                    availableBalanceAfterMinor = state.AvailableBalanceMinor
                }));
        });

        // ── GET /api/v1/ledger/me/payouts ─────────────────────────────────────
        group.MapGet("/payouts", async (
            HttpContext ctx,
            IAccountRepository repository,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsOrganizer && !auth.IsAdmin)
                return Problem("FORBIDDEN", "Access denied", 403, ctx.TraceIdentifier);

            var state = await repository.LoadAsync(auth.UserId, ct);
            var payouts = state.Payouts.Values.OrderByDescending(p => p.PayoutId).ToList();

            return Results.Ok(new SuccessEnvelope<IReadOnlyList<PayoutRecord>>(true, payouts));
        });

        return app;
    }

    private static IResult Problem(string code, string message, int status, string requestId) =>
        Results.Json(new ErrorEnvelope(false, code, message, requestId), statusCode: status);
}

public sealed record RequestPayoutBody(long AmountMinor);
