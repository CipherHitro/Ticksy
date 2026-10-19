// ── Application/AccountCommandHandler.cs ──────────────────────────────────────
// Coordinates: load state -> decide -> append.
// Automatically retries on optimistic concurrency conflicts (WrongExpectedVersionException).
using KurrentDB.Client;
using Ticksy.Ledger.Api.Domain;

namespace Ticksy.Ledger.Api.Application;

public interface IAccountCommandHandler
{
    Task<(AccountState State, IReadOnlyList<AccountEvent> Events)> HandleAsync(
        AccountCommand command,
        CancellationToken ct = default);
}

public sealed class AccountCommandHandler(
    IAccountRepository repository,
    IConfiguration configuration,
    ILogger<AccountCommandHandler> logger) : IAccountCommandHandler
{
    private const int MaxRetries = 15;

    public async Task<(AccountState State, IReadOnlyList<AccountEvent> Events)> HandleAsync(
        AccountCommand command,
        CancellationToken ct = default)
    {
        var platformFeeBps = configuration.GetValue("PLATFORM_FEE_BPS", AccountDecider.DefaultPlatformFeeBps);
        var minPayoutMinor = configuration.GetValue("MIN_PAYOUT_MINOR", AccountDecider.DefaultMinPayoutMinor);

        for (var attempt = 1; attempt <= MaxRetries; attempt++)
        {
            var state = await repository.LoadAsync(command.OrganizerId, ct);
            var now = DateTimeOffset.UtcNow;

            var events = AccountDecider.Decide(
                state,
                command,
                now,
                platformFeeBps,
                minPayoutMinor);

            if (events.Count == 0)
            {
                logger.LogInformation("Command {Command} produced no events (idempotent NO-OP) for organizer {Org}",
                    command.GetType().Name, command.OrganizerId);
                return (state, events);
            }

            try
            {
                await repository.AppendAsync(command.OrganizerId, state.Version, events, ct);

                // Evolve in memory to return the updated state to caller
                var nextState = events.Aggregate(state, AccountDecider.Evolve);
                return (nextState, events);
            }
            catch (WrongExpectedVersionException ex)
            {
                logger.LogWarning(
                    "Optimistic concurrency conflict on stream account-{Org} (attempt {Attempt}/{Max}): {Message}. Retrying...",
                    command.OrganizerId, attempt, MaxRetries, ex.Message);

                if (attempt == MaxRetries)
                    throw;

                // Jittered backoff to spread out concurrent retries and avoid thundering herd
                var delayMs = Random.Shared.Next(15, 40 * attempt);
                await Task.Delay(TimeSpan.FromMilliseconds(delayMs), ct);
            }
        }

        throw new InvalidOperationException("Failed to append events after maximum retries");
    }
}
