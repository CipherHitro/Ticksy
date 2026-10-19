// ── Domain/Events.cs ──────────────────────────────────────────────────────────
// Immutable facts appended to the stream: account-{organizerId}.
// Every event carries metadata for distributed tracing and auditability.
namespace Ticksy.Ledger.Api.Domain;

public sealed record EventMetadata(
    int SchemaVersion,
    string RequestId,
    string CausationId,
    string CorrelationId,
    DateTimeOffset OccurredAt);

public abstract record AccountEvent(EventMetadata Metadata);

public sealed record SaleRecorded(
    Guid BookingId,
    Guid EventId,
    string EventTitle,
    Guid PaymentId,
    long GrossMinor,
    long FeeMinor,
    long NetMinor,
    EventMetadata Metadata) : AccountEvent(Metadata);

public sealed record SaleRefunded(
    Guid BookingId,
    Guid RefundId,
    long GrossRefundedMinor,
    long FeeReversedMinor,
    long NetReversedMinor,
    EventMetadata Metadata) : AccountEvent(Metadata);

public sealed record PayoutRequested(
    Guid PayoutId,
    long AmountMinor,
    EventMetadata Metadata) : AccountEvent(Metadata);

public sealed record PayoutCompleted(
    Guid PayoutId,
    EventMetadata Metadata) : AccountEvent(Metadata);

public sealed record PayoutFailed(
    Guid PayoutId,
    string Reason,
    EventMetadata Metadata) : AccountEvent(Metadata);
