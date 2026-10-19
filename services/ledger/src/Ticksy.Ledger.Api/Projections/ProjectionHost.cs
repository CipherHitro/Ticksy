// ── Projections/ProjectionHost.cs ─────────────────────────────────────────────
// BackgroundService that subscribes to all events across KurrentDB and updates Redis read models.
using Grpc.Core;
using KurrentDB.Client;
using Ticksy.Ledger.Api.Infrastructure.Kurrent;
using Ticksy.Ledger.Api.Infrastructure.Redis;

namespace Ticksy.Ledger.Api.Projections;

public sealed class ProjectionHost(
    KurrentDBClient client,
    IRedisReadModelStore redisStore,
    ILogger<ProjectionHost> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Starting Ledger Projection Host");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunSubscriptionAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Projection subscription dropped or failed. Re-subscribing in 3 seconds...");
                await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
            }
        }

        logger.LogInformation("Ledger Projection Host stopped");
    }

    private async Task RunSubscriptionAsync(CancellationToken ct)
    {
        var status = await redisStore.GetProjectionStatusAsync();
        var startPosition = FromAll.Start;

        if (status.Checkpoint != "0" && status.Checkpoint.Contains(':'))
        {
            var parts = status.Checkpoint.Split(':');
            if (ulong.TryParse(parts[0], out var commit) && ulong.TryParse(parts[1], out var prepare))
            {
                startPosition = FromAll.After(new Position(commit, prepare));
                logger.LogInformation("Resuming projection from checkpoint {Commit}:{Prepare}", commit, prepare);
            }
        }
        else
        {
            logger.LogInformation("Starting projection from the beginning (FromAll.Start)");
        }

        var filterOptions = new SubscriptionFilterOptions(
            StreamFilter.Prefix("account-"));

        try
        {
            await using var subscription = client.SubscribeToAll(
                startPosition,
                filterOptions: filterOptions,
                cancellationToken: ct);

            await foreach (var message in subscription.Messages.WithCancellation(ct))
            {
                if (message is StreamMessage.Event(var resolvedEvent))
                {
                    var streamName = resolvedEvent.Event.EventStreamId;
                    if (!streamName.StartsWith("account-"))
                        continue;

                    var domainEvent = EventSerializer.ToDomainEvent(resolvedEvent);
                    if (domainEvent is null)
                        continue;

                    var position = resolvedEvent.Event.Position;
                    var revision = resolvedEvent.Event.EventNumber.ToUInt64();

                    await redisStore.ApplyEventAsync(streamName, revision, position, domainEvent);
                }
            }
        }
        catch (RpcException ex) when (ex.StatusCode == Grpc.Core.StatusCode.InvalidArgument)
        {
            logger.LogWarning("Saved checkpoint was out-of-range or invalid ({Message}). Resetting checkpoint to FromAll.Start.", ex.Message);
            await redisStore.RebuildAllAsync();
            throw;
        }
    }
}
