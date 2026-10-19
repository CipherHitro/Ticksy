// ── Application/AccountRepository.cs ──────────────────────────────────────────
// Reconstitutes aggregate state from KurrentDB event streams and appends new events
// with optimistic concurrency control.
using KurrentDB.Client;
using Ticksy.Ledger.Api.Domain;
using Ticksy.Ledger.Api.Infrastructure.Kurrent;

namespace Ticksy.Ledger.Api.Application;

public interface IAccountRepository
{
    Task<AccountState> LoadAsync(Guid organizerId, CancellationToken ct = default);
    Task AppendAsync(Guid organizerId, long expectedVersion, IReadOnlyList<AccountEvent> events, CancellationToken ct = default);
}

public sealed class AccountRepository(KurrentDBClient client, ILogger<AccountRepository> logger) : IAccountRepository
{
    public static string StreamName(Guid organizerId) => $"account-{organizerId}";

    public async Task<AccountState> LoadAsync(Guid organizerId, CancellationToken ct = default)
    {
        var stream = StreamName(organizerId);
        var state = AccountState.Empty(organizerId);

        try
        {
            var readResult = client.ReadStreamAsync(
                Direction.Forwards,
                stream,
                StreamPosition.Start,
                cancellationToken: ct);

            if (await readResult.ReadState == ReadState.StreamNotFound)
                return state;

            long lastRevision = -1;

            await foreach (var resolved in readResult.WithCancellation(ct))
            {
                var domainEvent = EventSerializer.ToDomainEvent(resolved);
                if (domainEvent is not null)
                {
                    state = AccountDecider.Evolve(state, domainEvent);
                }
                lastRevision = (long)resolved.Event.EventNumber.ToUInt64();
            }

            return state with { Version = lastRevision };
        }
        catch (StreamNotFoundException)
        {
            return state;
        }
    }

    public async Task AppendAsync(
        Guid organizerId,
        long expectedVersion,
        IReadOnlyList<AccountEvent> events,
        CancellationToken ct = default)
    {
        if (events.Count == 0)
            return;

        var stream = StreamName(organizerId);
        var eventData = events.Select(EventSerializer.ToEventData);

        if (expectedVersion < 0)
        {
            await client.AppendToStreamAsync(
                stream,
                StreamState.NoStream,
                eventData,
                cancellationToken: ct);
        }
        else
        {
            var expectedState = StreamState.StreamRevision((ulong)expectedVersion);
            await client.AppendToStreamAsync(
                stream,
                expectedState,
                eventData,
                cancellationToken: ct);
        }

        logger.LogInformation("Appended {Count} event(s) to stream {Stream}", events.Count, stream);
    }
}
