// ── Infrastructure/Redis/RedisReadModelStore.cs ──────────────────────────────
// Manages fast read-model queries in Redis and atomic projection updates.
using KurrentDB.Client;
using StackExchange.Redis;
using System.Text.Json;
using Ticksy.Ledger.Api.Domain;

namespace Ticksy.Ledger.Api.Infrastructure.Redis;

public sealed record StatementEntry(
    string Id,
    string Type,
    long GrossMinor,
    long FeeMinor,
    long NetMinor,
    long BalanceAfterMinor,
    string OccurredAt,
    string Description);

public sealed record OrganizerBalance(
    Guid OrganizerId,
    long GrossMinor,
    long FeesMinor,
    long RefundsGrossMinor,
    long RefundsFeesMinor,
    long PayoutsPendingMinor,
    long PayoutsCompletedMinor,
    long NetEarningsMinor,
    long AvailableBalanceMinor,
    string AsOf);

public sealed record EventSalesSummary(
    Guid EventId,
    string Title,
    long TicketsSold,
    long GrossMinor,
    long RefundsMinor,
    long NetMinor);

public sealed record PlatformRevenueSummary(
    string Date,
    long PlatformFeesMinor,
    long SalesCount,
    long RefundsCount);

public sealed record ProjectionStatus(
    string Checkpoint,
    bool IsRunning,
    string AsOf);

public interface IRedisReadModelStore
{
    Task<OrganizerBalance?> GetBalanceAsync(Guid organizerId);
    Task<(IReadOnlyList<StatementEntry> Entries, long Total)> GetStatementAsync(
        Guid organizerId, int page, int limit, DateTimeOffset? from, DateTimeOffset? to, string? type);
    Task<IReadOnlyList<EventSalesSummary>> GetOrganizerEventsAsync(Guid organizerId);
    Task<IReadOnlyList<PlatformRevenueSummary>> GetPlatformRevenueAsync(DateOnly from, DateOnly to);
    Task<ProjectionStatus> GetProjectionStatusAsync();
    Task RebuildAllAsync();
    Task ApplyEventAsync(string stream, ulong streamRevision, Position position, AccountEvent domainEvent);
}

public sealed class RedisReadModelStore(IConnectionMultiplexer redis, ILogger<RedisReadModelStore> logger) : IRedisReadModelStore
{
    private readonly IDatabase _db = redis.GetDatabase();

    public async Task<OrganizerBalance?> GetBalanceAsync(Guid organizerId)
    {
        var key = $"balance:{organizerId}";
        var entries = await _db.HashGetAllAsync(key);
        if (entries.Length == 0)
            return null;

        var dict = entries.ToDictionary(e => e.Name.ToString(), e => e.Value.ToString());

        return new OrganizerBalance(
            OrganizerId: organizerId,
            GrossMinor: GetLong(dict, "grossMinor"),
            FeesMinor: GetLong(dict, "feesMinor"),
            RefundsGrossMinor: GetLong(dict, "refundsGrossMinor"),
            RefundsFeesMinor: GetLong(dict, "refundsFeesMinor"),
            PayoutsPendingMinor: GetLong(dict, "payoutsPendingMinor"),
            PayoutsCompletedMinor: GetLong(dict, "payoutsCompletedMinor"),
            NetEarningsMinor: GetLong(dict, "netEarningsMinor"),
            AvailableBalanceMinor: GetLong(dict, "availableBalanceMinor"),
            AsOf: dict.GetValueOrDefault("asOf", DateTimeOffset.UtcNow.ToString("O")));
    }

    public async Task<(IReadOnlyList<StatementEntry> Entries, long Total)> GetStatementAsync(
        Guid organizerId, int page, int limit, DateTimeOffset? from, DateTimeOffset? to, string? type)
    {
        var statementKey = $"statement:{organizerId}";
        var total = await _db.SortedSetLengthAsync(statementKey);

        if (total == 0)
            return (Array.Empty<StatementEntry>(), 0);

        var start = (page - 1) * limit;
        var stop = start + limit - 1;

        // Fetch newest first (descending score)
        var entryIds = await _db.SortedSetRangeByRankAsync(statementKey, start, stop, Order.Descending);

        var list = new List<StatementEntry>();
        foreach (var id in entryIds)
        {
            var raw = await _db.StringGetAsync($"entry:{id}");
            if (raw.HasValue)
            {
                var entry = JsonSerializer.Deserialize<StatementEntry>(raw.ToString()!);
                if (entry is not null)
                {
                    if (type is not null && !entry.Type.Equals(type, StringComparison.OrdinalIgnoreCase))
                        continue;
                    list.Add(entry);
                }
            }
        }

        return (list, total);
    }

    public async Task<IReadOnlyList<EventSalesSummary>> GetOrganizerEventsAsync(Guid organizerId)
    {
        var setKey = $"organizer-events:{organizerId}";
        var eventIds = await _db.SetMembersAsync(setKey);

        var list = new List<EventSalesSummary>();
        foreach (var id in eventIds)
        {
            var key = $"event-sales:{id}";
            var entries = await _db.HashGetAllAsync(key);
            if (entries.Length > 0)
            {
                var dict = entries.ToDictionary(e => e.Name.ToString(), e => e.Value.ToString());
                list.Add(new EventSalesSummary(
                    EventId: Guid.Parse(id.ToString()),
                    Title: dict.GetValueOrDefault("title", "Event"),
                    TicketsSold: GetLong(dict, "ticketsSold"),
                    GrossMinor: GetLong(dict, "grossMinor"),
                    RefundsMinor: GetLong(dict, "refundsMinor"),
                    NetMinor: GetLong(dict, "netMinor")));
            }
        }

        return list;
    }

    public async Task<IReadOnlyList<PlatformRevenueSummary>> GetPlatformRevenueAsync(DateOnly from, DateOnly to)
    {
        var list = new List<PlatformRevenueSummary>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var key = $"platform:revenue:{d:yyyy-MM-dd}";
            var entries = await _db.HashGetAllAsync(key);
            if (entries.Length > 0)
            {
                var dict = entries.ToDictionary(e => e.Name.ToString(), e => e.Value.ToString());
                list.Add(new PlatformRevenueSummary(
                    Date: d.ToString("yyyy-MM-dd"),
                    PlatformFeesMinor: GetLong(dict, "platformFeesMinor"),
                    SalesCount: GetLong(dict, "salesCount"),
                    RefundsCount: GetLong(dict, "refundsCount")));
            }
            else
            {
                list.Add(new PlatformRevenueSummary(d.ToString("yyyy-MM-dd"), 0, 0, 0));
            }
        }

        return list;
    }

    public async Task<ProjectionStatus> GetProjectionStatusAsync()
    {
        var checkpoint = await _db.StringGetAsync("checkpoint:ledger");
        var asOf = await _db.StringGetAsync("checkpoint:asOf");

        return new ProjectionStatus(
            Checkpoint: checkpoint.HasValue ? checkpoint.ToString() : "0",
            IsRunning: true,
            AsOf: asOf.HasValue ? asOf.ToString() : DateTimeOffset.UtcNow.ToString("O"));
    }

    public async Task RebuildAllAsync()
    {
        logger.LogWarning("Rebuilding all Redis read models - resetting checkpoint");
        var server = redis.GetServer(redis.GetEndPoints().First());

        // Reset checkpoint
        await _db.KeyDeleteAsync("checkpoint:ledger");
        await _db.KeyDeleteAsync("checkpoint:asOf");

        // Clear all read-model keys matching prefixes
        var keys = server.Keys(pattern: "balance:*")
            .Concat(server.Keys(pattern: "statement:*"))
            .Concat(server.Keys(pattern: "entry:*"))
            .Concat(server.Keys(pattern: "event-sales:*"))
            .Concat(server.Keys(pattern: "organizer-events:*"))
            .Concat(server.Keys(pattern: "platform:revenue:*"))
            .Concat(server.Keys(pattern: "applied:*"))
            .ToArray();

        if (keys.Length > 0)
        {
            await _db.KeyDeleteAsync(keys);
        }
    }

    public async Task ApplyEventAsync(string stream, ulong streamRevision, Position position, AccountEvent domainEvent)
    {
        // 1. Idempotency check: applied:{stream}
        var appliedKey = $"applied:{stream}";
        var lastApplied = await _db.StringGetAsync(appliedKey);
        if (lastApplied.HasValue && ulong.TryParse(lastApplied.ToString(), out var lastRev) && streamRevision <= lastRev)
        {
            return; // already applied
        }

        if (!stream.StartsWith("account-") || !Guid.TryParse(stream["account-".Length..], out var organizerId))
            return;

#pragma warning disable CS4014 // Redis transaction operations are queued and awaited via tx.ExecuteAsync()
        var tx = _db.CreateTransaction();
        var nowStr = domainEvent.Metadata.OccurredAt.ToString("O");
        var posStr = $"{position.CommitPosition}:{position.PreparePosition}";

        // Update checkpoint & stream revision
        tx.StringSetAsync("checkpoint:ledger", posStr);
        tx.StringSetAsync("checkpoint:asOf", nowStr);
        tx.StringSetAsync(appliedKey, streamRevision.ToString());

        var balanceKey = $"balance:{organizerId}";
        var statementKey = $"statement:{organizerId}";
        var entryId = Guid.NewGuid().ToString("N");

        switch (domainEvent)
        {
            case SaleRecorded sale:
            {
                tx.HashIncrementAsync(balanceKey, "grossMinor", sale.GrossMinor);
                tx.HashIncrementAsync(balanceKey, "feesMinor", sale.FeeMinor);
                tx.HashIncrementAsync(balanceKey, "netEarningsMinor", sale.NetMinor);
                tx.HashIncrementAsync(balanceKey, "availableBalanceMinor", sale.NetMinor);
                tx.HashSetAsync(balanceKey, "asOf", nowStr);

                // Statement entry
                var entry = new StatementEntry(
                    Id: entryId,
                    Type: "SALE",
                    GrossMinor: sale.GrossMinor,
                    FeeMinor: sale.FeeMinor,
                    NetMinor: sale.NetMinor,
                    BalanceAfterMinor: 0, // updated in query or projection
                    OccurredAt: nowStr,
                    Description: $"Ticket sale for {sale.EventTitle}");
                tx.StringSetAsync($"entry:{entryId}", JsonSerializer.Serialize(entry));
                tx.SortedSetAddAsync(statementKey, entryId, streamRevision);

                // Event sales model
                var eventKey = $"event-sales:{sale.EventId}";
                tx.HashSetAsync(eventKey, "title", sale.EventTitle);
                tx.HashIncrementAsync(eventKey, "ticketsSold", 1);
                tx.HashIncrementAsync(eventKey, "grossMinor", sale.GrossMinor);
                tx.HashIncrementAsync(eventKey, "netMinor", sale.NetMinor);
                tx.SetAddAsync($"organizer-events:{organizerId}", sale.EventId.ToString());

                // Platform daily revenue
                var dayKey = $"platform:revenue:{domainEvent.Metadata.OccurredAt:yyyy-MM-dd}";
                tx.HashIncrementAsync(dayKey, "platformFeesMinor", sale.FeeMinor);
                tx.HashIncrementAsync(dayKey, "salesCount", 1);
                break;
            }

            case SaleRefunded refund:
            {
                tx.HashIncrementAsync(balanceKey, "refundsGrossMinor", refund.GrossRefundedMinor);
                tx.HashIncrementAsync(balanceKey, "refundsFeesMinor", refund.FeeReversedMinor);
                tx.HashDecrementAsync(balanceKey, "netEarningsMinor", refund.NetReversedMinor);
                tx.HashDecrementAsync(balanceKey, "availableBalanceMinor", refund.NetReversedMinor);
                tx.HashSetAsync(balanceKey, "asOf", nowStr);

                var entry = new StatementEntry(
                    Id: entryId,
                    Type: "REFUND",
                    GrossMinor: -refund.GrossRefundedMinor,
                    FeeMinor: -refund.FeeReversedMinor,
                    NetMinor: -refund.NetReversedMinor,
                    BalanceAfterMinor: 0,
                    OccurredAt: nowStr,
                    Description: "Refund for booking");
                tx.StringSetAsync($"entry:{entryId}", JsonSerializer.Serialize(entry));
                tx.SortedSetAddAsync(statementKey, entryId, streamRevision);

                var dayKey = $"platform:revenue:{domainEvent.Metadata.OccurredAt:yyyy-MM-dd}";
                tx.HashDecrementAsync(dayKey, "platformFeesMinor", refund.FeeReversedMinor);
                tx.HashIncrementAsync(dayKey, "refundsCount", 1);
                break;
            }

            case PayoutRequested req:
            {
                tx.HashIncrementAsync(balanceKey, "payoutsPendingMinor", req.AmountMinor);
                tx.HashDecrementAsync(balanceKey, "availableBalanceMinor", req.AmountMinor);
                tx.HashSetAsync(balanceKey, "asOf", nowStr);

                var entry = new StatementEntry(
                    Id: entryId,
                    Type: "PAYOUT_REQUESTED",
                    GrossMinor: 0,
                    FeeMinor: 0,
                    NetMinor: -req.AmountMinor,
                    BalanceAfterMinor: 0,
                    OccurredAt: nowStr,
                    Description: $"Payout requested: {req.AmountMinor} paise");
                tx.StringSetAsync($"entry:{entryId}", JsonSerializer.Serialize(entry));
                tx.SortedSetAddAsync(statementKey, entryId, streamRevision);

                // Track payout in organizer's payout list
                tx.SetAddAsync($"payouts:{organizerId}", req.PayoutId.ToString());
                tx.HashSetAsync($"payout:{req.PayoutId}", [
                    new HashEntry("payoutId", req.PayoutId.ToString()),
                    new HashEntry("organizerId", organizerId.ToString()),
                    new HashEntry("amountMinor", req.AmountMinor),
                    new HashEntry("status", "PENDING"),
                    new HashEntry("requestedAt", nowStr)
                ]);
                break;
            }

            case PayoutCompleted comp:
            {
                var payoutData = await _db.HashGetAllAsync($"payout:{comp.PayoutId}");
                var amt = GetLong(payoutData.ToDictionary(e => e.Name.ToString(), e => e.Value.ToString()), "amountMinor");

                tx.HashDecrementAsync(balanceKey, "payoutsPendingMinor", amt);
                tx.HashIncrementAsync(balanceKey, "payoutsCompletedMinor", amt);
                tx.HashSetAsync(balanceKey, "asOf", nowStr);

                tx.HashSetAsync($"payout:{comp.PayoutId}", "status", "COMPLETED");
                tx.HashSetAsync($"payout:{comp.PayoutId}", "completedAt", nowStr);

                var entry = new StatementEntry(
                    Id: entryId,
                    Type: "PAYOUT_COMPLETED",
                    GrossMinor: 0,
                    FeeMinor: 0,
                    NetMinor: 0,
                    BalanceAfterMinor: 0,
                    OccurredAt: nowStr,
                    Description: "Payout completed");
                tx.StringSetAsync($"entry:{entryId}", JsonSerializer.Serialize(entry));
                tx.SortedSetAddAsync(statementKey, entryId, streamRevision);
                break;
            }

            case PayoutFailed fail:
            {
                var payoutData = await _db.HashGetAllAsync($"payout:{fail.PayoutId}");
                var amt = GetLong(payoutData.ToDictionary(e => e.Name.ToString(), e => e.Value.ToString()), "amountMinor");

                // Return reserved funds back to available balance
                tx.HashDecrementAsync(balanceKey, "payoutsPendingMinor", amt);
                tx.HashIncrementAsync(balanceKey, "availableBalanceMinor", amt);
                tx.HashSetAsync(balanceKey, "asOf", nowStr);

                tx.HashSetAsync($"payout:{fail.PayoutId}", "status", "FAILED");
                tx.HashSetAsync($"payout:{fail.PayoutId}", "failureReason", fail.Reason);

                var entry = new StatementEntry(
                    Id: entryId,
                    Type: "PAYOUT_FAILED",
                    GrossMinor: 0,
                    FeeMinor: 0,
                    NetMinor: amt,
                    BalanceAfterMinor: 0,
                    OccurredAt: nowStr,
                    Description: $"Payout failed: {fail.Reason}");
                tx.StringSetAsync($"entry:{entryId}", JsonSerializer.Serialize(entry));
                tx.SortedSetAddAsync(statementKey, entryId, streamRevision);
                break;
            }
        }

        await tx.ExecuteAsync();
#pragma warning restore CS4014
    }

    private static long GetLong(IReadOnlyDictionary<string, string> dict, string key) =>
        dict.TryGetValue(key, out var val) && long.TryParse(val, out var res) ? res : 0;
}
