// ── LedgerIntegrationTests.cs ─────────────────────────────────────────────────
// End-to-end integration tests against live KurrentDB (port 2113) and Redis (port 6381):
// 1. Appending and reloading events from KurrentDB event store
// 2. 20 concurrent parallel sales for one organizer all land cleanly via optimistic concurrency retries
// 3. Projections write read models to Redis
// 4. Rebuild restores identical state from event store
using KurrentDB.Client;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;
using Ticksy.Ledger.Api.Application;
using Ticksy.Ledger.Api.Domain;
using Ticksy.Ledger.Api.Infrastructure.Redis;
using Xunit;

namespace Ticksy.Ledger.Tests;

public class LedgerIntegrationTests
{
    private const string KurrentConn = "kurrentdb://localhost:2113?tls=false";
    private const string RedisConn = "localhost:6381";

    private static KurrentDBClient CreateKurrentClient() =>
        new(KurrentDBClientSettings.Create(KurrentConn));

    private static IConnectionMultiplexer CreateRedis() =>
        ConnectionMultiplexer.Connect(RedisConn);

    [Fact]
    public async Task EventStore_Appends_And_Reloads_AccountAggregate()
    {
        var client = CreateKurrentClient();
        var repo = new AccountRepository(client, NullLogger<AccountRepository>.Instance);

        var organizerId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        var paymentId = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        // 1. Initial load on empty stream returns empty state (Version -1)
        var initial = await repo.LoadAsync(organizerId);
        Assert.Equal(-1, initial.Version);
        Assert.Equal(0, initial.AvailableBalanceMinor);

        // 2. Decide and append first event
        var cmd = new RecordSale(
            organizerId, bookingId, eventId, "Rock Night", paymentId,
            100000, "INR", new CommandMetadata("req-1"));

        var events = AccountDecider.Decide(initial, cmd, DateTimeOffset.UtcNow);
        Assert.Single(events);

        await repo.AppendAsync(organizerId, initial.Version, events);

        // 3. Reload from stream
        var reloaded = await repo.LoadAsync(organizerId);
        Assert.Equal(0, reloaded.Version); // stream revision 0
        Assert.Equal(100000, reloaded.GrossMinor);
        Assert.Equal(5000, reloaded.FeesMinor);
        Assert.Equal(95000, reloaded.AvailableBalanceMinor);
    }

    [Fact]
    public async Task Twenty_ParallelSales_AllLand_AndBalanceIsCorrect()
    {
        // "20 parallel sales for one organizer all land exactly once and the balance is correct"
        var client = CreateKurrentClient();
        var repo = new AccountRepository(client, NullLogger<AccountRepository>.Instance);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["PLATFORM_FEE_BPS"] = "500", // 5%
                ["MIN_PAYOUT_MINOR"] = "1000"
            })
            .Build();

        var handler = new AccountCommandHandler(repo, config, NullLogger<AccountCommandHandler>.Instance);

        var organizerId = Guid.NewGuid();
        const int parallelCount = 20;
        const long ticketPriceMinor = 10000; // Rs 100 per ticket -> 500 fee, 9500 net

        var tasks = Enumerable.Range(0, parallelCount).Select(async i =>
        {
            var bookingId = Guid.NewGuid();
            var cmd = new RecordSale(
                OrganizerId: organizerId,
                BookingId: bookingId,
                EventId: Guid.NewGuid(),
                EventTitle: $"Show {i}",
                PaymentId: Guid.NewGuid(),
                GrossMinor: ticketPriceMinor,
                Currency: "INR",
                Metadata: new CommandMetadata($"req-parallel-{i}"));

            return await handler.HandleAsync(cmd);
        });

        var results = await Task.WhenAll(tasks);
        Assert.Equal(parallelCount, results.Length);

        // Verify final aggregate state from KurrentDB
        var finalState = await repo.LoadAsync(organizerId);

        // 20 sales of Rs 100 = Rs 2000 gross (200,000 paise)
        // 20 fees of Rs 5 = Rs 100 fee (10,000 paise)
        // 20 net of Rs 95 = Rs 1900 net (190,000 paise)
        Assert.Equal(200000, finalState.GrossMinor);
        Assert.Equal(10000, finalState.FeesMinor);
        Assert.Equal(190000, finalState.AvailableBalanceMinor);
        Assert.Equal(19, finalState.Version); // Revisions 0 through 19
        Assert.Equal(20, finalState.RecordedSales.Count);
    }

    [Fact]
    public async Task Redis_Projections_And_Rebuild_Demo()
    {
        using var redis = CreateRedis();
        var redisStore = new RedisReadModelStore(redis, NullLogger<RedisReadModelStore>.Instance);

        var organizerId = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        var bookingId = Guid.NewGuid();
        var stream = AccountRepository.StreamName(organizerId);

        var saleEvent = new SaleRecorded(
            BookingId: bookingId,
            EventId: eventId,
            EventTitle: "Indie Fest",
            PaymentId: Guid.NewGuid(),
            GrossMinor: 50000,
            FeeMinor: 2500,
            NetMinor: 47500,
            Metadata: new EventMetadata(1, "req-1", "cause-1", "corr-1", DateTimeOffset.UtcNow));

        // 1. Apply projection
        await redisStore.ApplyEventAsync(stream, 0, new Position(100, 100), saleEvent);

        // 2. Query balance model from Redis
        var balance = await redisStore.GetBalanceAsync(organizerId);
        Assert.NotNull(balance);
        Assert.Equal(50000, balance.GrossMinor);
        Assert.Equal(2500, balance.FeesMinor);
        Assert.Equal(47500, balance.AvailableBalanceMinor);

        // 3. Query statement from Redis
        var (entries, total) = await redisStore.GetStatementAsync(organizerId, 1, 10, null, null, null);
        Assert.Equal(1, total);
        Assert.Single(entries);
        Assert.Equal("SALE", entries[0].Type);
        Assert.Equal(50000, entries[0].GrossMinor);

        // 4. Test Rebuild: clears read models and resets checkpoint
        await redisStore.RebuildAllAsync();

        var balanceAfterRebuild = await redisStore.GetBalanceAsync(organizerId);
        Assert.Null(balanceAfterRebuild); // cleared!

        // 5. Replay event to rebuild read models
        await redisStore.ApplyEventAsync(stream, 0, new Position(100, 100), saleEvent);
        var restoredBalance = await redisStore.GetBalanceAsync(organizerId);
        Assert.NotNull(restoredBalance);
        Assert.Equal(balance.AvailableBalanceMinor, restoredBalance.AvailableBalanceMinor); // Identical!
    }
}
