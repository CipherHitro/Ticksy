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
                var bookingId = ParseGuid(payload, "bookingId");
                var eventId = ParseGuid(payload, "eventId");
                var eventTitle = payload.TryGetProperty("eventTitle", out var titleProp) ? titleProp.GetString() ?? "Event" : "Event";
                var organizerId = ParseGuid(payload, "organizerId");
                var paymentId = ParseGuid(payload, "paymentId");
                var totalAmountMinor = payload.TryGetProperty("totalAmountMinor", out var tam) ? tam.GetInt64() : 0;
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
                var bookingId = ParseGuid(payload, "bookingId");
                var organizerId = ParseGuid(payload, "organizerId");
                var refundId = ParseGuid(payload, "refundId");
                var refundAmountMinor = payload.TryGetProperty("refundAmountMinor", out var ram) ? ram.GetInt64() : 0;
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

    private static Guid ParseGuid(JsonElement el, string prop)
    {
        if (el.TryGetProperty(prop, out var p))
        {
            if (p.ValueKind == JsonValueKind.String && Guid.TryParse(p.GetString(), out var g))
                return g;
        }
        return Guid.NewGuid();
    }
}
