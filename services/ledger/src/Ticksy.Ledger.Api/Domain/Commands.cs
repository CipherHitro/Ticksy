// ── Domain/Commands.cs ────────────────────────────────────────────────────────
// Inbound commands to the Ledger aggregate.
namespace Ticksy.Ledger.Api.Domain;

public sealed record CommandMetadata(
    string RequestId,
    string? CausationId = null,
    string? CorrelationId = null);

public abstract record AccountCommand(Guid OrganizerId, CommandMetadata Metadata);

public sealed record RecordSale(
    Guid OrganizerId,
    Guid BookingId,
    Guid EventId,
    string EventTitle,
    Guid PaymentId,
    long GrossMinor,
    string Currency,
    CommandMetadata Metadata) : AccountCommand(OrganizerId, Metadata);

public sealed record RefundSale(
    Guid OrganizerId,
    Guid BookingId,
    Guid RefundId,
    long GrossRefundedMinor,
    string Currency,
    CommandMetadata Metadata) : AccountCommand(OrganizerId, Metadata);

public sealed record RequestPayout(
    Guid OrganizerId,
    Guid PayoutId,
    long AmountMinor,
    CommandMetadata Metadata) : AccountCommand(OrganizerId, Metadata);

public sealed record CompletePayout(
    Guid OrganizerId,
    Guid PayoutId,
    CommandMetadata Metadata) : AccountCommand(OrganizerId, Metadata);

public sealed record FailPayout(
    Guid OrganizerId,
    Guid PayoutId,
    string Reason,
    CommandMetadata Metadata) : AccountCommand(OrganizerId, Metadata);

public sealed class DomainException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
