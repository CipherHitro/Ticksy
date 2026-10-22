// ── Domain/AccountDecider.cs ──────────────────────────────────────────────────
// Pure functions:
// 1. Decide(state, command, now, options) -> events (validates and issues events)
// 2. Evolve(state, event) -> state (applies immutable state transitions)
// NO database, NO I/O, 100% deterministic and unit-testable.
using System.Collections.Immutable;

namespace Ticksy.Ledger.Api.Domain;

public static class AccountDecider
{
    public const int DefaultPlatformFeeBps = 500;   // 5.00%
    public const long DefaultMinPayoutMinor = 10000; // Rs. 100.00

    public static IReadOnlyList<AccountEvent> Decide(
        AccountState state,
        AccountCommand command,
        DateTimeOffset now,
        int platformFeeBps = DefaultPlatformFeeBps,
        long minPayoutMinor = DefaultMinPayoutMinor)
    {
        return command switch
        {
            RecordSale cmd => DecideRecordSale(state, cmd, now, platformFeeBps),
            RefundSale cmd => DecideRefundSale(state, cmd, now),
            RequestPayout cmd => DecideRequestPayout(state, cmd, now, minPayoutMinor),
            CompletePayout cmd => DecideCompletePayout(state, cmd, now),
            FailPayout cmd => DecideFailPayout(state, cmd, now),
            _ => throw new NotSupportedException($"Command {command.GetType().Name} is not supported")
        };
    }

    public static AccountState Evolve(AccountState state, AccountEvent @event)
    {
        var nextVersion = state.Version + 1;

        return @event switch
        {
            SaleRecorded e => state with
            {
                GrossMinor = state.GrossMinor + e.GrossMinor,
                FeesMinor = state.FeesMinor + e.FeeMinor,
                RecordedSales = state.RecordedSales.SetItem(e.BookingId, new SaleSnapshot(e.BookingId, e.GrossMinor, e.FeeMinor, e.NetMinor)),
                Version = nextVersion
            },

            SaleRefunded e => state with
            {
                RefundsGrossMinor = state.RefundsGrossMinor + e.GrossRefundedMinor,
                RefundsFeesMinor = state.RefundsFeesMinor + e.FeeReversedMinor,
                RefundedBookingIds = state.RefundedBookingIds.Add(e.BookingId),
                Version = nextVersion
            },

            PayoutRequested e => state with
            {
                PayoutsPendingMinor = state.PayoutsPendingMinor + e.AmountMinor,
                Payouts = state.Payouts.SetItem(e.PayoutId, new PayoutRecord(e.PayoutId, e.AmountMinor, PayoutStatus.Pending)),
                Version = nextVersion
            },

            PayoutCompleted e => state.Payouts.TryGetValue(e.PayoutId, out var p)
                ? state with
                {
                    PayoutsPendingMinor = state.PayoutsPendingMinor - p.AmountMinor,
                    PayoutsCompletedMinor = state.PayoutsCompletedMinor + p.AmountMinor,
                    Payouts = state.Payouts.SetItem(e.PayoutId, p with { Status = PayoutStatus.Completed }),
                    Version = nextVersion
                }
                : state with { Version = nextVersion },

            PayoutFailed e => state.Payouts.TryGetValue(e.PayoutId, out var p)
                ? state with
                {
                    PayoutsPendingMinor = state.PayoutsPendingMinor - p.AmountMinor, // returns funds to available balance
                    Payouts = state.Payouts.SetItem(e.PayoutId, p with { Status = PayoutStatus.Failed, FailureReason = e.Reason }),
                    Version = nextVersion
                }
                : state with { Version = nextVersion },

            _ => state with { Version = nextVersion }
        };
    }

    private static IReadOnlyList<AccountEvent> DecideRecordSale(
        AccountState state,
        RecordSale cmd,
        DateTimeOffset now,
        int platformFeeBps)
    {
        if (cmd.Currency != "INR")
            throw new DomainException("UNSUPPORTED_CURRENCY", $"Currency {cmd.Currency} is not supported. Ledger accepts INR only.");

        // Idempotency: duplicate booking sale is a safe NO-OP
        if (state.RecordedSales.ContainsKey(cmd.BookingId))
            return Array.Empty<AccountEvent>();

        // Platform fee calculation: integer round half up (gross * bps + 5000) / 10000
        var feeMinor = (cmd.GrossMinor * platformFeeBps + 5000) / 10000;
        var netMinor = cmd.GrossMinor - feeMinor;

        var metadata = new EventMetadata(
            SchemaVersion: 1,
            RequestId: cmd.Metadata.RequestId,
            CausationId: cmd.Metadata.CausationId ?? cmd.BookingId.ToString(),
            CorrelationId: cmd.Metadata.CorrelationId ?? cmd.Metadata.RequestId,
            OccurredAt: now);

        return [new SaleRecorded(
            BookingId: cmd.BookingId,
            EventId: cmd.EventId,
            EventTitle: cmd.EventTitle,
            PaymentId: cmd.PaymentId,
            GrossMinor: cmd.GrossMinor,
            FeeMinor: feeMinor,
            NetMinor: netMinor,
            Metadata: metadata)];
    }

    private static IReadOnlyList<AccountEvent> DecideRefundSale(
        AccountState state,
        RefundSale cmd,
        DateTimeOffset now)
    {
        if (cmd.Currency != "INR")
            throw new DomainException("UNSUPPORTED_CURRENCY", $"Currency {cmd.Currency} is not supported. Ledger accepts INR only.");

        // Idempotency: already-refunded booking is a safe NO-OP
        if (state.RefundedBookingIds.Contains(cmd.BookingId))
            return Array.Empty<AccountEvent>();

        // Full refund: reverses original gross, fee, and net, or uses command payload
        long grossRefunded = cmd.GrossRefundedMinor;
        long feeReversed = (long)Math.Round(grossRefunded * 0.05);
        long netReversed = grossRefunded - feeReversed;

        if (state.RecordedSales.TryGetValue(cmd.BookingId, out var originalSale))
        {
            grossRefunded = originalSale.GrossMinor;
            feeReversed = originalSale.FeeMinor;
            netReversed = originalSale.NetMinor;
        }

        var metadata = new EventMetadata(
            SchemaVersion: 1,
            RequestId: cmd.Metadata.RequestId,
            CausationId: cmd.Metadata.CausationId ?? cmd.RefundId.ToString(),
            CorrelationId: cmd.Metadata.CorrelationId ?? cmd.Metadata.RequestId,
            OccurredAt: now);

        return [new SaleRefunded(
            BookingId: cmd.BookingId,
            RefundId: cmd.RefundId,
            GrossRefundedMinor: grossRefunded,
            FeeReversedMinor: feeReversed,
            NetReversedMinor: netReversed,
            Metadata: metadata)];
    }

    private static IReadOnlyList<AccountEvent> DecideRequestPayout(
        AccountState state,
        RequestPayout cmd,
        DateTimeOffset now,
        long minPayoutMinor)
    {
        if (cmd.AmountMinor <= 0)
            throw new DomainException("VALIDATION_ERROR", "Payout amount must be positive");

        if (cmd.AmountMinor < minPayoutMinor)
            throw new DomainException("MINIMUM_PAYOUT_NOT_MET", $"Payout amount must be at least {minPayoutMinor} paise");

        if (cmd.AmountMinor > state.AvailableBalanceMinor)
            throw new DomainException("INSUFFICIENT_BALANCE", $"Insufficient balance: requested {cmd.AmountMinor} paise, but available balance is {state.AvailableBalanceMinor} paise");

        // Idempotency: duplicate payoutId
        if (state.Payouts.ContainsKey(cmd.PayoutId))
            return Array.Empty<AccountEvent>();

        var metadata = new EventMetadata(
            SchemaVersion: 1,
            RequestId: cmd.Metadata.RequestId,
            CausationId: cmd.Metadata.CausationId ?? cmd.PayoutId.ToString(),
            CorrelationId: cmd.Metadata.CorrelationId ?? cmd.Metadata.RequestId,
            OccurredAt: now);

        return [new PayoutRequested(cmd.PayoutId, cmd.AmountMinor, metadata)];
    }

    private static IReadOnlyList<AccountEvent> DecideCompletePayout(
        AccountState state,
        CompletePayout cmd,
        DateTimeOffset now)
    {
        if (!state.Payouts.TryGetValue(cmd.PayoutId, out var payout))
            throw new DomainException("PAYOUT_NOT_FOUND", $"Payout {cmd.PayoutId} was not found");

        if (payout.Status != PayoutStatus.Pending)
            throw new DomainException("INVALID_PAYOUT_STATE", $"Payout {cmd.PayoutId} is already {payout.Status}");

        var metadata = new EventMetadata(
            SchemaVersion: 1,
            RequestId: cmd.Metadata.RequestId,
            CausationId: cmd.Metadata.CausationId ?? cmd.PayoutId.ToString(),
            CorrelationId: cmd.Metadata.CorrelationId ?? cmd.Metadata.RequestId,
            OccurredAt: now);

        return [new PayoutCompleted(cmd.PayoutId, metadata)];
    }

    private static IReadOnlyList<AccountEvent> DecideFailPayout(
        AccountState state,
        FailPayout cmd,
        DateTimeOffset now)
    {
        if (!state.Payouts.TryGetValue(cmd.PayoutId, out var payout))
            throw new DomainException("PAYOUT_NOT_FOUND", $"Payout {cmd.PayoutId} was not found");

        if (payout.Status != PayoutStatus.Pending)
            throw new DomainException("INVALID_PAYOUT_STATE", $"Payout {cmd.PayoutId} is already {payout.Status}");

        var metadata = new EventMetadata(
            SchemaVersion: 1,
            RequestId: cmd.Metadata.RequestId,
            CausationId: cmd.Metadata.CausationId ?? cmd.PayoutId.ToString(),
            CorrelationId: cmd.Metadata.CorrelationId ?? cmd.Metadata.RequestId,
            OccurredAt: now);

        return [new PayoutFailed(cmd.PayoutId, cmd.Reason, metadata)];
    }
}
