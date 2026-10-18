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

public sealed record VerifyPaymentRequest(string RazorpayPaymentId, string RazorpaySignature);
public sealed record RefundRequest(string Reason);
