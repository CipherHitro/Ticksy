// ── Endpoints/WebhookEndpoints.cs ────────────────────────────────────────────
// POST /api/v1/payments/webhooks/razorpay — PUBLIC (no JWT required).
// Razorpay POSTs here when payment.captured or payment.failed events fire.
// We verify the HMAC signature over the raw body, deduplicate on event ID,
// and update payment status + write outbox — all in one DB transaction.
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Json;
using Ticksy.Payment.Api.Data;
using Ticksy.Payment.Api.Domain;
using Ticksy.Payment.Api.Gateways;

namespace Ticksy.Payment.Api.Endpoints;

public static class WebhookEndpoints
{
    public static IEndpointRouteBuilder MapWebhookEndpoints(this IEndpointRouteBuilder app)
    {
        // Note: express.raw equivalent — we read raw bytes so signature is correct.
        // In ASP.NET this means we disable the default body-reading and use
        // ctx.Request.Body directly BEFORE any body parsing middleware touches it.
        // We register this route BEFORE UseRouting adds JSON parsing.
        app.MapPost("/api/v1/payments/webhooks/razorpay", async (
            HttpContext ctx,
            PaymentDbContext db,
            IRazorpayGateway razorpay,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Ticksy.Payment.WebhookEndpoints");
            // ── 1. Read raw body ─────────────────────────────────────────────
            using var reader  = new StreamReader(ctx.Request.Body, Encoding.UTF8, leaveOpen: true);
            var rawBody       = await reader.ReadToEndAsync(ct);

            // ── 2. Verify HMAC-SHA256 signature ─────────────────────────────
            var signature     = ctx.Request.Headers["X-Razorpay-Signature"].FirstOrDefault() ?? "";
            if (!razorpay.VerifyWebhookSignature(rawBody, signature))
            {
                logger.LogWarning("Webhook signature mismatch, rejecting");
                return Results.Json(new { success = false, code = "VALIDATION_ERROR" }, statusCode: 400);
            }

            // ── 3. Parse the event ───────────────────────────────────────────
            using var doc         = JsonDocument.Parse(rawBody);
            var root              = doc.RootElement;
            var providerEventId   = root.GetProperty("id").GetString() ?? Guid.NewGuid().ToString();
            var eventType         = root.GetProperty("event").GetString() ?? "";

            // ── 4. Deduplicate ───────────────────────────────────────────────
            var alreadySeen = await db.WebhookEvents
                .AnyAsync(w => w.ProviderEventId == providerEventId, ct);

            if (alreadySeen)
            {
                logger.LogInformation("Duplicate webhook {EventId}, ignoring", providerEventId);
                return Results.Ok(new { success = true });  // still 200 — don't make Razorpay retry
            }

            // Record this event for future deduplication
            db.WebhookEvents.Add(new WebhookEvent(providerEventId, eventType, rawBody));

            // ── 5. Handle known event types ──────────────────────────────────
            if (eventType == "payment.captured")
            {
                await HandlePaymentCaptured(root, db, logger, providerEventId, ct);
            }
            else if (eventType == "payment.failed")
            {
                await HandlePaymentFailed(root, db, logger, ct);
            }
            else
            {
                logger.LogDebug("Ignoring unhandled Razorpay event type: {EventType}", eventType);
            }

            // ── 6. Commit everything atomically ──────────────────────────────
            await db.SaveChangesAsync(ct);

            // Razorpay expects 200 quickly — do NOT do heavy work here
            return Results.Ok(new { success = true });
        });

        return app;
    }

    private static async Task HandlePaymentCaptured(
        JsonElement root, PaymentDbContext db, ILogger logger, string providerEventId, CancellationToken ct)
    {
        var payloadPay    = root.GetProperty("payload").GetProperty("payment").GetProperty("entity");
        var providerOrderId  = payloadPay.GetProperty("order_id").GetString()  ?? "";
        var providerPaymentId = payloadPay.GetProperty("id").GetString()        ?? "";
        var amount           = payloadPay.GetProperty("amount").GetInt64();

        var payment = await db.Payments.FirstOrDefaultAsync(p => p.ProviderOrderId == providerOrderId, ct);
        if (payment is null)
        {
            logger.LogWarning("payment.captured for unknown order {OrderId}", providerOrderId);
            return;
        }

        // Cross-check amount so we can't be tricked by a tampered webhook
        if (payment.AmountMinor != amount)
        {
            logger.LogError("Amount mismatch: stored={Stored} provider={Provider}", payment.AmountMinor, amount);
            return;
        }

        if (payment.Status != PaymentStatus.CREATED)
        {
            logger.LogInformation("payment.captured for already-processed payment {Id}", payment.Id);
            return;
        }

        payment.MarkPaid(providerPaymentId, providerEventId);

        db.OutboxEvents.Add(new OutboxEvent(
            "PaymentSucceeded",
            payment.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new
            {
                payment.Id,
                payment.BookingId,
                payment.AmountMinor,
                payment.Currency
            })));
    }

    private static async Task HandlePaymentFailed(
        JsonElement root, PaymentDbContext db, ILogger logger, CancellationToken ct)
    {
        var payloadPay    = root.GetProperty("payload").GetProperty("payment").GetProperty("entity");
        var providerOrderId = payloadPay.GetProperty("order_id").GetString() ?? "";

        var payment = await db.Payments.FirstOrDefaultAsync(p => p.ProviderOrderId == providerOrderId, ct);
        if (payment is null)
        {
            logger.LogWarning("payment.failed for unknown order {OrderId}", providerOrderId);
            return;
        }

        if (payment.Status != PaymentStatus.CREATED) return;

        payment.MarkFailed();

        db.OutboxEvents.Add(new OutboxEvent(
            "PaymentFailed",
            payment.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { payment.Id, payment.BookingId })));
    }
}
