// ── Domain/Refund.cs ─────────────────────────────────────────────────────────
namespace Ticksy.Payment.Api.Domain;

public class Refund
{
    public Guid           Id              { get; private set; } = Guid.NewGuid();
    public Guid           PaymentId       { get; private set; }
    public long           AmountMinor     { get; private set; }
    public string         Reason          { get; private set; } = string.Empty;
    public RefundStatus   Status          { get; private set; } = RefundStatus.REFUND_PENDING;
    public string?        ProviderRefundId { get; set; }        // from Razorpay
    public DateTimeOffset CreatedAt       { get; private set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt       { get; private set; } = DateTimeOffset.UtcNow;

    private Refund() { }

    public Refund(Guid paymentId, long amountMinor, string reason)
    {
        PaymentId   = paymentId;
        AmountMinor = amountMinor;
        Reason      = reason;
    }

    public void MarkRefunded(string providerRefundId)
    {
        ProviderRefundId = providerRefundId;
        Status           = RefundStatus.REFUNDED;
        UpdatedAt        = DateTimeOffset.UtcNow;
    }
}
