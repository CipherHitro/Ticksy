// ── Domain/AccountState.cs ────────────────────────────────────────────────────
// Immutable state representing the reconstituted organizer account.
// Derived solely by folding past events through Evolve.
using System.Collections.Immutable;

namespace Ticksy.Ledger.Api.Domain;

public enum PayoutStatus
{
    Pending,
    Completed,
    Failed
}

public sealed record SaleSnapshot(
    Guid BookingId,
    long GrossMinor,
    long FeeMinor,
    long NetMinor);

public sealed record PayoutRecord(
    Guid PayoutId,
    long AmountMinor,
    PayoutStatus Status,
    string? FailureReason = null);

public sealed record AccountState(
    Guid OrganizerId,
    long GrossMinor,
    long FeesMinor,
    long RefundsGrossMinor,
    long RefundsFeesMinor,
    long PayoutsPendingMinor,
    long PayoutsCompletedMinor,
    ImmutableDictionary<Guid, SaleSnapshot> RecordedSales,
    ImmutableHashSet<Guid> RefundedBookingIds,
    ImmutableDictionary<Guid, PayoutRecord> Payouts,
    long Version = 0)
{
    public static AccountState Empty(Guid organizerId) => new(
        OrganizerId: organizerId,
        GrossMinor: 0,
        FeesMinor: 0,
        RefundsGrossMinor: 0,
        RefundsFeesMinor: 0,
        PayoutsPendingMinor: 0,
        PayoutsCompletedMinor: 0,
        RecordedSales: ImmutableDictionary<Guid, SaleSnapshot>.Empty,
        RefundedBookingIds: ImmutableHashSet<Guid>.Empty,
        Payouts: ImmutableDictionary<Guid, PayoutRecord>.Empty,
        Version: -1);

    /// <summary>
    /// Total net earnings = (gross - refunded gross) - (platform fees - reversed platform fees).
    /// </summary>
    public long NetEarningsMinor => (GrossMinor - RefundsGrossMinor) - (FeesMinor - RefundsFeesMinor);

    /// <summary>
    /// Funds currently free for payout = net earnings - pending payouts - completed payouts.
    /// Can be negative if a refund occurs after payout completion (clawback).
    /// </summary>
    public long AvailableBalanceMinor => NetEarningsMinor - PayoutsPendingMinor - PayoutsCompletedMinor;
}
