// ── AccountDeciderTests.cs ────────────────────────────────────────────────────
// Unit tests verifying the pure Decider rules without any I/O or databases.
using Ticksy.Ledger.Api.Domain;
using Xunit;

namespace Ticksy.Ledger.Tests;

public class AccountDeciderTests
{
    private static readonly DateTimeOffset TestTime = DateTimeOffset.Parse("2026-10-19T10:00:00Z");
    private static readonly Guid OrganizerId = Guid.NewGuid();

    [Theory]
    [InlineData(1000, 500, 50, 950)]    // Rs 10 @ 5% = 50 paise fee, 950 net
    [InlineData(10, 500, 1, 9)]          // 10 paise @ 5% = 0.5 paise -> rounds up to 1 paise
    [InlineData(9, 500, 0, 9)]           // 9 paise @ 5% = 0.45 paise -> rounds down to 0 paise
    [InlineData(150000, 500, 7500, 142500)] // Rs 1500 @ 5% = 7500 paise fee, 142500 net
    [InlineData(1003, 500, 50, 953)]    // 1003 * 500 = 501500 + 5000 = 506500 / 10000 = 50 paise
    [InlineData(1010, 500, 51, 959)]    // 1010 * 500 = 505000 + 5000 = 510000 / 10000 = 51 paise
    public void FeeCalculation_RoundsHalfUp_WithAwkwardAmounts(
        long grossMinor, int bps, long expectedFee, long expectedNet)
    {
        var state = AccountState.Empty(OrganizerId);
        var cmd = new RecordSale(
            OrganizerId: OrganizerId,
            BookingId: Guid.NewGuid(),
            EventId: Guid.NewGuid(),
            EventTitle: "Rock Concert",
            PaymentId: Guid.NewGuid(),
            GrossMinor: grossMinor,
            Currency: "INR",
            Metadata: new CommandMetadata("req-1"));

        var events = AccountDecider.Decide(state, cmd, TestTime, platformFeeBps: bps);

        Assert.Single(events);
        var sale = Assert.IsType<SaleRecorded>(events[0]);
        Assert.Equal(expectedFee, sale.FeeMinor);
        Assert.Equal(expectedNet, sale.NetMinor);

        var evolved = AccountDecider.Evolve(state, sale);
        Assert.Equal(grossMinor, evolved.GrossMinor);
        Assert.Equal(expectedFee, evolved.FeesMinor);
        Assert.Equal(expectedNet, evolved.NetEarningsMinor);
        Assert.Equal(expectedNet, evolved.AvailableBalanceMinor);
    }

    [Fact]
    public void DuplicateSale_IsNoOp()
    {
        var bookingId = Guid.NewGuid();
        var cmd = new RecordSale(
            OrganizerId, bookingId, Guid.NewGuid(), "Concert", Guid.NewGuid(),
            50000, "INR", new CommandMetadata("req-1"));

        var state = AccountState.Empty(OrganizerId);
        var events = AccountDecider.Decide(state, cmd, TestTime);
        Assert.Single(events);

        var evolved = AccountDecider.Evolve(state, events[0]);

        // Second call with same bookingId
        var duplicateEvents = AccountDecider.Decide(evolved, cmd, TestTime);
        Assert.Empty(duplicateEvents);
    }

    [Fact]
    public void NonInrCurrency_ThrowsUnsupportedCurrency()
    {
        var state = AccountState.Empty(OrganizerId);
        var cmd = new RecordSale(
            OrganizerId, Guid.NewGuid(), Guid.NewGuid(), "Concert", Guid.NewGuid(),
            50000, "USD", new CommandMetadata("req-1"));

        var ex = Assert.Throws<DomainException>(() =>
            AccountDecider.Decide(state, cmd, TestTime));
        Assert.Equal("UNSUPPORTED_CURRENCY", ex.Code);
    }

    [Fact]
    public void RequestPayout_WithInsufficientBalance_ThrowsException()
    {
        var state = AccountState.Empty(OrganizerId); // Available balance = 0
        var cmd = new RequestPayout(OrganizerId, Guid.NewGuid(), 10000, new CommandMetadata("req-1"));

        var ex = Assert.Throws<DomainException>(() =>
            AccountDecider.Decide(state, cmd, TestTime, minPayoutMinor: 1000));
        Assert.Equal("INSUFFICIENT_BALANCE", ex.Code);
    }

    [Fact]
    public void RequestPayout_BelowMinimum_ThrowsException()
    {
        var state = AccountState.Empty(OrganizerId) with { GrossMinor = 50000 };
        var cmd = new RequestPayout(OrganizerId, Guid.NewGuid(), 500, new CommandMetadata("req-1"));

        var ex = Assert.Throws<DomainException>(() =>
            AccountDecider.Decide(state, cmd, TestTime, minPayoutMinor: 10000));
        Assert.Equal("MINIMUM_PAYOUT_NOT_MET", ex.Code);
    }

    [Fact]
    public void RequestPayout_ReservesFundsImmediately_PreventingDoubleSpend()
    {
        // 1. Initial sale of Rs 100 (10000 paise). Fee @ 5% = 500. Net = 9500 paise.
        var state = AccountState.Empty(OrganizerId);
        var saleEvent = Assert.Single(AccountDecider.Decide(state, new RecordSale(
            OrganizerId, Guid.NewGuid(), Guid.NewGuid(), "Event", Guid.NewGuid(),
            10000, "INR", new CommandMetadata("req-1")), TestTime));
        state = AccountDecider.Evolve(state, saleEvent);
        Assert.Equal(9500, state.AvailableBalanceMinor);

        // 2. Request payout of Rs 60 (6000 paise).
        var payoutId1 = Guid.NewGuid();
        var payoutEvent1 = Assert.Single(AccountDecider.Decide(state, new RequestPayout(
            OrganizerId, payoutId1, 6000, new CommandMetadata("req-2")), TestTime, minPayoutMinor: 1000));
        state = AccountDecider.Evolve(state, payoutEvent1);

        // Available balance is now 9500 - 6000 = 3500 paise!
        Assert.Equal(3500, state.AvailableBalanceMinor);
        Assert.Equal(6000, state.PayoutsPendingMinor);

        // 3. Second request for 5000 paise must fail because only 3500 is available!
        var payoutId2 = Guid.NewGuid();
        var ex = Assert.Throws<DomainException>(() =>
            AccountDecider.Decide(state, new RequestPayout(
                OrganizerId, payoutId2, 5000, new CommandMetadata("req-3")), TestTime, minPayoutMinor: 1000));
        Assert.Equal("INSUFFICIENT_BALANCE", ex.Code);
    }

    [Fact]
    public void PayoutLifecycle_Complete_And_Fail_ReturnsFunds()
    {
        // Start with balance of 10000
        var state = AccountState.Empty(OrganizerId) with { GrossMinor = 10000 };
        var payoutId = Guid.NewGuid();

        // 1. Request payout of 5000
        var reqEvt = Assert.Single(AccountDecider.Decide(state, new RequestPayout(
            OrganizerId, payoutId, 5000, new CommandMetadata("req-1")), TestTime, minPayoutMinor: 1000));
        state = AccountDecider.Evolve(state, reqEvt);
        Assert.Equal(5000, state.AvailableBalanceMinor);
        Assert.Equal(5000, state.PayoutsPendingMinor);

        // 2. Fail payout -> funds return to available balance
        var failEvt = Assert.Single(AccountDecider.Decide(state, new FailPayout(
            OrganizerId, payoutId, "Bank rejected IFSC", new CommandMetadata("req-2")), TestTime));
        state = AccountDecider.Evolve(state, failEvt);

        Assert.Equal(10000, state.AvailableBalanceMinor);
        Assert.Equal(0, state.PayoutsPendingMinor);
        Assert.Equal(PayoutStatus.Failed, state.Payouts[payoutId].Status);
        Assert.Equal("Bank rejected IFSC", state.Payouts[payoutId].FailureReason);

        // 3. Request again and complete
        var payoutId2 = Guid.NewGuid();
        var reqEvt2 = Assert.Single(AccountDecider.Decide(state, new RequestPayout(
            OrganizerId, payoutId2, 4000, new CommandMetadata("req-3")), TestTime, minPayoutMinor: 1000));
        state = AccountDecider.Evolve(state, reqEvt2);

        var completeEvt = Assert.Single(AccountDecider.Decide(state, new CompletePayout(
            OrganizerId, payoutId2, new CommandMetadata("req-4")), TestTime));
        state = AccountDecider.Evolve(state, completeEvt);

        Assert.Equal(6000, state.AvailableBalanceMinor);
        Assert.Equal(0, state.PayoutsPendingMinor);
        Assert.Equal(4000, state.PayoutsCompletedMinor);
        Assert.Equal(PayoutStatus.Completed, state.Payouts[payoutId2].Status);
    }

    [Fact]
    public void RefundSale_AfterPayout_PushesBalanceNegative_Clawback()
    {
        var bookingId = Guid.NewGuid();
        var state = AccountState.Empty(OrganizerId);

        // 1. Record sale: 10000 paise (fee 500 -> net 9500)
        var sale = Assert.Single(AccountDecider.Decide(state, new RecordSale(
            OrganizerId, bookingId, Guid.NewGuid(), "Concert", Guid.NewGuid(),
            10000, "INR", new CommandMetadata("req-1")), TestTime));
        state = AccountDecider.Evolve(state, sale);

        // 2. Request and complete full payout of 9500
        var payoutId = Guid.NewGuid();
        var req = Assert.Single(AccountDecider.Decide(state, new RequestPayout(
            OrganizerId, payoutId, 9500, new CommandMetadata("req-2")), TestTime, minPayoutMinor: 1000));
        state = AccountDecider.Evolve(state, req);
        var comp = Assert.Single(AccountDecider.Decide(state, new CompletePayout(
            OrganizerId, payoutId, new CommandMetadata("req-3")), TestTime));
        state = AccountDecider.Evolve(state, comp);

        Assert.Equal(0, state.AvailableBalanceMinor);

        // 3. Attendee requests refund after payout was completed!
        var refundId = Guid.NewGuid();
        var refundEvt = Assert.Single(AccountDecider.Decide(state, new RefundSale(
            OrganizerId, bookingId, refundId, 10000, "INR", new CommandMetadata("req-4")), TestTime));
        state = AccountDecider.Evolve(state, refundEvt);

        // Net earnings became 0, but payout completed was 9500 -> balance is -9500 (clawback!)
        Assert.Equal(-9500, state.AvailableBalanceMinor);

        // 4. Any new payout request must be blocked
        var ex = Assert.Throws<DomainException>(() =>
            AccountDecider.Decide(state, new RequestPayout(
                OrganizerId, Guid.NewGuid(), 1000, new CommandMetadata("req-5")), TestTime, minPayoutMinor: 1000));
        Assert.Equal("INSUFFICIENT_BALANCE", ex.Code);
    }
}
