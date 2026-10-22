// ── Endpoints/PaymentEndpoints.cs ───────────────────────────────────────────
// All HTTP payment routes registered with Minimal API.
// Route prefix: /api/v1/payments
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Ticksy.Payment.Api.Auth;
using Ticksy.Payment.Api.Data;
using Ticksy.Payment.Api.Domain;
using Ticksy.Payment.Api.Gateways;

namespace Ticksy.Payment.Api.Endpoints;

public static class PaymentEndpoints
{
    public static IEndpointRouteBuilder MapPaymentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/payments");

        // ── POST /api/v1/payments ───────────────────────────────────────────
        // Creates a Payment record and creates an order with Razorpay.
        group.MapPost("", async (
            [FromBody] CreatePaymentHttpRequest req,
            HttpContext ctx,
            PaymentDbContext db,
            IRazorpayGateway razorpay,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger(typeof(PaymentEndpoints));
            var auth = ctx.RequireAuthContext();

            if (req.BookingId == Guid.Empty || req.AmountMinor <= 0)
                return Problem("VALIDATION_ERROR", "bookingId and positive amountMinor are required", 400, ctx.TraceIdentifier);

            var currency = string.IsNullOrWhiteSpace(req.Currency) ? "INR" : req.Currency.ToUpperInvariant();
            var idempotencyKey = ctx.Request.Headers.TryGetValue("Idempotency-Key", out var ik) && !string.IsNullOrWhiteSpace(ik)
                ? ik.ToString()
                : $"http_{req.BookingId}_{req.AmountMinor}";

            // Idempotency check
            var existing = await db.Payments
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.IdempotencyKey == idempotencyKey, ct);

            if (existing is not null)
            {
                return Results.Ok(new SuccessEnvelope<object>(true, new
                {
                    paymentId = existing.Id,
                    bookingId = existing.BookingId,
                    amountMinor = existing.AmountMinor,
                    currency = existing.Currency,
                    status = existing.Status.ToString(),
                    providerOrderId = existing.ProviderOrderId,
                    keyId = razorpay.KeyId
                }));
            }

            // Check if duplicate payment for this booking
            var duplicate = await db.Payments
                .FirstOrDefaultAsync(p => p.BookingId == req.BookingId, ct);

            if (duplicate is not null)
            {
                if (duplicate.Status == PaymentStatus.CREATED)
                {
                    return Results.Ok(new SuccessEnvelope<object>(true, new
                    {
                        paymentId = duplicate.Id,
                        bookingId = duplicate.BookingId,
                        amountMinor = duplicate.AmountMinor,
                        currency = duplicate.Currency,
                        status = duplicate.Status.ToString(),
                        providerOrderId = duplicate.ProviderOrderId,
                        keyId = razorpay.KeyId
                    }));
                }
                return Problem("CONFLICT", "A payment already exists for this booking", 409, ctx.TraceIdentifier);
            }

            // Create Razorpay order
            string providerOrderId;
            try
            {
                providerOrderId = await razorpay.CreateOrderAsync(
                    req.AmountMinor,
                    currency,
                    req.BookingId.ToString("N")[..16]);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Razorpay order creation failed for booking {BookingId}", req.BookingId);
                return Problem("BAD_GATEWAY", "Payment provider unavailable", 502, ctx.TraceIdentifier);
            }

            var payment = new Domain.Payment(
                req.BookingId,
                auth.UserId,
                req.AmountMinor,
                currency,
                providerOrderId,
                idempotencyKey);

            db.Payments.Add(payment);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/payments/{payment.Id}", new SuccessEnvelope<object>(true, new
            {
                paymentId = payment.Id,
                bookingId = payment.BookingId,
                amountMinor = payment.AmountMinor,
                currency = payment.Currency,
                status = payment.Status.ToString(),
                providerOrderId = payment.ProviderOrderId,
                keyId = razorpay.KeyId
            }));
        }).RequireAuthorization();

        // ── GET /api/v1/payments/{id} ────────────────────────────────────────
        // Caller must be owner of the payment or ADMIN.
        group.MapGet("/{id:guid}", async (
            Guid id,
            HttpContext ctx,
            PaymentDbContext db,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();

            var payment = await db.Payments.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == id, ct);

            if (payment is null)
                return Problem("NOT_FOUND", "Payment not found", 404, ctx.TraceIdentifier);

            if (!auth.IsAdmin && !auth.IsOwner(payment.UserId))
                return Problem("FORBIDDEN", "Access denied", 403, ctx.TraceIdentifier);

            return Results.Ok(new SuccessEnvelope<object>(true, new
            {
                payment.Id,
                payment.BookingId,
                payment.UserId,
                payment.AmountMinor,
                payment.Currency,
                payment.Status,
                payment.ProviderOrderId,
                payment.ProviderPaymentId,
                payment.CreatedAt,
                payment.UpdatedAt,
            }));
        }).RequireAuthorization();

        // ── POST /api/v1/payments/{id}/verify ───────────────────────────────
        // Convenience route: client sends back Checkout signature to confirm.
        // This is NOT the source of truth — the webhook is.
        group.MapPost("/{id:guid}/verify", async (
            Guid id,
            [FromBody] VerifyPaymentRequest req,
            HttpContext ctx,
            PaymentDbContext db,
            IRazorpayGateway razorpay,
            CancellationToken ct) =>
        {
            var auth    = ctx.RequireAuthContext();
            var payment = await db.Payments.FirstOrDefaultAsync(p => p.Id == id, ct);

            if (payment is null)
                return Problem("NOT_FOUND", "Payment not found", 404, ctx.TraceIdentifier);

            if (!auth.IsOwner(payment.UserId))
                return Problem("FORBIDDEN", "Access denied", 403, ctx.TraceIdentifier);

            if (payment.Status != PaymentStatus.CREATED)
                return Problem("CONFLICT", $"Payment is already {payment.Status}", 409, ctx.TraceIdentifier);

            var valid = razorpay.VerifyPaymentSignature(
                payment.ProviderOrderId,
                req.RazorpayPaymentId,
                req.RazorpaySignature);

            if (!valid)
                return Problem("VALIDATION_ERROR", "Invalid payment signature", 400, ctx.TraceIdentifier);

            payment.MarkPaid(req.RazorpayPaymentId, req.RazorpaySignature);

            // Write outbox event atomically with the status update
            db.OutboxEvents.Add(new OutboxEvent(
                "PaymentSucceeded",
                payment.Id.ToString(),
                JsonSerializer.Serialize(new { payment.Id, payment.BookingId, payment.AmountMinor, payment.Currency })));

            await db.SaveChangesAsync(ct);

            return Results.Ok(new SuccessEnvelope<object>(true, new { payment.Id, payment.Status }));
        }).RequireAuthorization();

        // ── POST /api/v1/payments/{id}/refund ───────────────────────────────
        // ADMIN only for now.
        group.MapPost("/{id:guid}/refund", async (
            Guid id,
            [FromBody] RefundRequest req,
            HttpContext ctx,
            PaymentDbContext db,
            IRazorpayGateway razorpay,
            CancellationToken ct) =>
        {
            var auth = ctx.RequireAuthContext();
            if (!auth.IsAdmin)
                return Problem("FORBIDDEN", "Admin access required", 403, ctx.TraceIdentifier);

            var payment = await db.Payments.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (payment is null)
                return Problem("NOT_FOUND", "Payment not found", 404, ctx.TraceIdentifier);

            if (payment.Status != PaymentStatus.PAID)
                return Problem("CONFLICT", "Only PAID payments can be refunded", 409, ctx.TraceIdentifier);

            if (payment.ProviderPaymentId is null)
                return Problem("INTERNAL_ERROR", "Provider payment ID missing", 500, ctx.TraceIdentifier);

            var providerRefundId = await razorpay.RefundAsync(payment.ProviderPaymentId, payment.AmountMinor);

            var refund = new Refund(payment.Id, payment.AmountMinor, req.Reason);
            refund.MarkRefunded(providerRefundId);
            payment.MarkRefunded();

            db.Refunds.Add(refund);

            db.OutboxEvents.Add(new OutboxEvent(
                "PaymentRefunded",
                payment.Id.ToString(),
                JsonSerializer.Serialize(new { payment.Id, payment.BookingId, RefundId = refund.Id })));

            await db.SaveChangesAsync(ct);

            return Results.Ok(new SuccessEnvelope<object>(true, new { RefundId = refund.Id, payment.Status }));
        }).RequireAuthorization();

        return app;
    }

    private static IResult Problem(string code, string message, int status, string requestId) =>
        Results.Json(
            new ErrorEnvelope(false, code, message, requestId),
            statusCode: status);
}

public sealed record CreatePaymentHttpRequest(Guid BookingId, long AmountMinor, string? Currency = "INR");
public sealed record VerifyPaymentRequest(string RazorpayPaymentId, string RazorpaySignature);
public sealed record RefundRequest(string Reason);
