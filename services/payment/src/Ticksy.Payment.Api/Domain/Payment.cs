// ── Domain/Payment.cs ────────────────────────────────────────────────────────
// The aggregate root representing a single payment attempt.
// "rowversion" maps to byte[] and gives us optimistic concurrency for free
// – SQL Server auto-increments it on every UPDATE.
namespace Ticksy.Payment.Api.Domain;

public class Payment
{
    public Guid           Id                { get; private set; } = Guid.NewGuid();
    public Guid           BookingId         { get; private set; }
    public Guid           UserId            { get; private set; }
    public long           AmountMinor       { get; private set; }   // paise
    public string         Currency          { get; private set; } = "INR";
    public PaymentStatus  Status            { get; private set; } = PaymentStatus.CREATED;

    // Razorpay identifiers
    public string         ProviderOrderId   { get; private set; } = string.Empty;
    public string?        ProviderPaymentId { get; set; }    // filled on PAID
    public string?        ProviderSignature { get; set; }    // filled on PAID

    public string         IdempotencyKey    { get; private set; } = string.Empty;

    public DateTimeOffset CreatedAt         { get; private set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt         { get; private set; } = DateTimeOffset.UtcNow;

    // Optimistic concurrency token — verified on every UPDATE
    public int            Version           { get; private set; } = 1;

    // EF Core needs a parameterless constructor (can be private/protected)
    private Payment() { }

    public Payment(
        Guid   bookingId,
        Guid   userId,
        long   amountMinor,
        string currency,
        string providerOrderId,
        string idempotencyKey)
    {
        BookingId       = bookingId;
        UserId          = userId;
        AmountMinor     = amountMinor;
        Currency        = currency;
        ProviderOrderId = providerOrderId;
        IdempotencyKey  = idempotencyKey;
    }

    public void MarkPaid(string providerPaymentId, string providerSignature)
    {
        Status              = PaymentStatus.PAID;
        ProviderPaymentId   = providerPaymentId;
        ProviderSignature   = providerSignature;
        UpdatedAt           = DateTimeOffset.UtcNow;
        Version++;
    }

    public void MarkFailed()
    {
        Status    = PaymentStatus.FAILED;
        UpdatedAt = DateTimeOffset.UtcNow;
        Version++;
    }

    public void MarkExpired()
    {
        Status    = PaymentStatus.EXPIRED;
        UpdatedAt = DateTimeOffset.UtcNow;
        Version++;
    }

    public void MarkRefunded()
    {
        Status    = PaymentStatus.REFUNDED;
        UpdatedAt = DateTimeOffset.UtcNow;
        Version++;
    }
}
