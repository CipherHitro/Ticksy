// ── Endpoints/DevEndpoints.cs ─────────────────────────────────────────────────
// Development-only endpoint to inject inbound events (e.g. BookingConfirmed, BookingRefunded)
// directly into the ledger without running Kafka.
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using Ticksy.Ledger.Api.Application;
using Ticksy.Ledger.Api.Domain;

namespace Ticksy.Ledger.Api.Endpoints;

public static class DevEndpoints
{
    public static IEndpointRouteBuilder MapDevEndpoints(this IEndpointRouteBuilder app, IWebHostEnvironment env)
    {
        if (!env.IsDevelopment())
            return app;

        app.MapPost("/api/v1/ledger/dev/events", async (
            [FromBody] JsonElement root,
            HttpContext ctx,
            IAccountCommandHandler commandHandler,
            CancellationToken ct) =>
        {
            var eventType = root.TryGetProperty("eventType", out var et) ? et.GetString() : null;
            if (string.IsNullOrWhiteSpace(eventType))
                eventType = root.TryGetProperty("type", out var t) ? t.GetString() : null;

            var payload = root.TryGetProperty("payload", out var p) ? p : root;
            var requestId = ctx.TraceIdentifier;

            if (eventType == "BookingConfirmed")
            {
                var bookingId = payload.GetProperty("bookingId").GetGuid();
                var eventId = payload.GetProperty("eventId").GetGuid();
                var eventTitle = payload.TryGetProperty("eventTitle", out var titleProp) ? titleProp.GetString() ?? "Event" : "Event";
                var organizerId = payload.GetProperty("organizerId").GetGuid();
                var paymentId = payload.GetProperty("paymentId").GetGuid();
                var totalAmountMinor = payload.GetProperty("totalAmountMinor").GetInt64();
                var currency = payload.TryGetProperty("currency", out var currProp) ? currProp.GetString() ?? "INR" : "INR";

                var cmd = new RecordSale(
                    OrganizerId: organizerId,
                    BookingId: bookingId,
                    EventId: eventId,
                    EventTitle: eventTitle,
                    PaymentId: paymentId,
                    GrossMinor: totalAmountMinor,
                    Currency: currency,
                    Metadata: new CommandMetadata(requestId, CausationId: bookingId.ToString()));

                var (state, events) = await commandHandler.HandleAsync(cmd, ct);

                return Results.Ok(new SuccessEnvelope<object>(true, new
                {
                    status = "APPLIED",
                    eventsProduced = events.Count,
                    balance = state.AvailableBalanceMinor
                }));
            }

            if (eventType == "BookingRefunded")
            {
                var bookingId = payload.GetProperty("bookingId").GetGuid();
                var organizerId = payload.GetProperty("organizerId").GetGuid();
                var refundId = payload.GetProperty("refundId").GetGuid();
                var refundAmountMinor = payload.GetProperty("refundAmountMinor").GetInt64();
                var currency = payload.TryGetProperty("currency", out var currProp) ? currProp.GetString() ?? "INR" : "INR";

                var cmd = new RefundSale(
                    OrganizerId: organizerId,
                    BookingId: bookingId,
                    RefundId: refundId,
                    GrossRefundedMinor: refundAmountMinor,
                    Currency: currency,
                    Metadata: new CommandMetadata(requestId, CausationId: refundId.ToString()));

                var (state, events) = await commandHandler.HandleAsync(cmd, ct);

                return Results.Ok(new SuccessEnvelope<object>(true, new
                {
                    status = "APPLIED",
                    eventsProduced = events.Count,
                    balance = state.AvailableBalanceMinor
                }));
            }

            return Results.BadRequest(new ErrorEnvelope(false, "UNSUPPORTED_EVENT", $"Event {eventType} is not handled", requestId));
        });

        return app;
    }
}
