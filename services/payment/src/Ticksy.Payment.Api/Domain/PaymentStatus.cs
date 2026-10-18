// ── Domain/PaymentStatus.cs ──────────────────────────────────────────────────
// This enum exactly mirrors the proto enum names.
// JsonStringEnumConverter in Program.cs makes it serialize as "PAID" not 2.
namespace Ticksy.Payment.Api.Domain;

public enum PaymentStatus
{
    CREATED,
    PAID,
    FAILED,
    EXPIRED,
    REFUNDED
}

public enum RefundStatus
{
    REFUND_PENDING,
    REFUNDED
}
