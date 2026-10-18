// ── Grpc/PaymentGrpcService.cs ───────────────────────────────────────────────
// The gRPC server implementation. Booking calls this to initiate a payment.
// The generated base class (PaymentServiceBase) comes from the .proto file
// via Grpc.AspNetCore at build time.
using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;
using Ticksy.Payment.Api.Data;
using Ticksy.Payment.Api.Domain;
using Ticksy.Payment.Api.Gateways;
using Ticksy.Payment.Grpc.V1;

namespace Ticksy.Payment.Api.Grpc;

public sealed class PaymentGrpcService(
    PaymentDbContext  db,
    IRazorpayGateway  razorpay,
    IConfiguration    config,
    ILogger<PaymentGrpcService> logger)
    : PaymentService.PaymentServiceBase
{
    // ── CreatePayment ────────────────────────────────────────────────────────
    // Called by Booking service over gRPC.
    // Idempotent: replays the same response if the idempotency_key was used before.
    public override async Task<CreatePaymentResponse> CreatePayment(
        CreatePaymentRequest request,
        ServerCallContext context)
    {
        if (!Guid.TryParse(request.BookingId, out var bookingId) ||
            !Guid.TryParse(request.UserId,    out var userId))
        {
            throw new RpcException(new Status(StatusCode.InvalidArgument, "Invalid booking_id or user_id"));
        }

        // Idempotency check
        var existing = await db.Payments
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.IdempotencyKey == request.IdempotencyKey);

        if (existing is not null)
        {
            logger.LogInformation("Replaying idempotent CreatePayment for key {Key}", request.IdempotencyKey);
            return ToResponse(existing);
        }

        // Guard: only one payment per booking
        var duplicate = await db.Payments
            .AnyAsync(p => p.BookingId == bookingId);

        if (duplicate)
            throw new RpcException(new Status(StatusCode.AlreadyExists, "A payment already exists for this booking"));

        // Create Razorpay order — receiptId appears on the Razorpay dashboard
        string providerOrderId;
        try
        {
            providerOrderId = await razorpay.CreateOrderAsync(
                request.AmountMinor,
                request.Currency,
                bookingId.ToString("N")[..16]);  // Razorpay receipt max 40 chars
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Razorpay order creation failed");
            throw new RpcException(new Status(StatusCode.Unavailable, "Payment provider unavailable"));
        }

        var payment = new Domain.Payment(
            bookingId,
            userId,
            request.AmountMinor,
            request.Currency,
            providerOrderId,
            request.IdempotencyKey);

        db.Payments.Add(payment);
        await db.SaveChangesAsync(context.CancellationToken);

        logger.LogInformation("Created payment {Id} for booking {BookingId}", payment.Id, bookingId);
        return ToResponse(payment);
    }

    // ── GetPayment ───────────────────────────────────────────────────────────
    public override async Task<GetPaymentResponse> GetPayment(
        GetPaymentRequest request,
        ServerCallContext context)
    {
        if (!Guid.TryParse(request.PaymentId, out var paymentId))
            throw new RpcException(new Status(StatusCode.InvalidArgument, "Invalid payment_id"));

        var payment = await db.Payments.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == paymentId);

        if (payment is null)
            throw new RpcException(new Status(StatusCode.NotFound, "Payment not found"));

        return new GetPaymentResponse
        {
            PaymentId  = payment.Id.ToString(),
            BookingId  = payment.BookingId.ToString(),
            Status     = ToProtoStatus(payment.Status),
        };
    }

    private CreatePaymentResponse ToResponse(Domain.Payment payment) =>
        new()
        {
            PaymentId       = payment.Id.ToString(),
            Provider        = "razorpay",
            ProviderOrderId = payment.ProviderOrderId,
            PublicKey       = config["RAZORPAY_KEY_ID"] ?? config["Razorpay:KeyId"] ?? "",
            AmountMinor     = payment.AmountMinor,
            Currency        = payment.Currency,
        };

    private static Ticksy.Payment.Grpc.V1.PaymentStatus ToProtoStatus(Domain.PaymentStatus s) => s switch
    {
        Domain.PaymentStatus.CREATED  => Ticksy.Payment.Grpc.V1.PaymentStatus.Created,
        Domain.PaymentStatus.PAID     => Ticksy.Payment.Grpc.V1.PaymentStatus.Paid,
        Domain.PaymentStatus.FAILED   => Ticksy.Payment.Grpc.V1.PaymentStatus.Failed,
        Domain.PaymentStatus.EXPIRED  => Ticksy.Payment.Grpc.V1.PaymentStatus.Expired,
        Domain.PaymentStatus.REFUNDED => Ticksy.Payment.Grpc.V1.PaymentStatus.Refunded,
        _                             => Ticksy.Payment.Grpc.V1.PaymentStatus.Unspecified
    };
}
