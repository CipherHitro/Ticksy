// ── Messaging/OutboxWorker.cs ─────────────────────────────────────────────────
// A background worker that polls the outbox table every 5 seconds,
// publishes pending events to the message broker (placeholder log for now),
// then marks them as processed.
// When Kafka is wired up, the TODO here becomes the producer call.
using Microsoft.EntityFrameworkCore;
using Ticksy.Payment.Api.Data;

namespace Ticksy.Payment.Api.Messaging;

public sealed class OutboxWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<OutboxWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Outbox worker started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Outbox worker iteration failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }

    private async Task ProcessBatchAsync(CancellationToken ct)
    {
        // Use a fresh scope each time — DbContext is scoped, not singleton
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PaymentDbContext>();

        var pending = await db.OutboxEvents
            .Where(o => o.ProcessedAt == null)
            .OrderBy(o => o.OccurredAt)
            .Take(20)
            .ToListAsync(ct);

        if (pending.Count == 0) return;

        foreach (var evt in pending)
        {
            try
            {
                // TODO: publish to Kafka topic "payment.events" here
                // For now we log so the outbox pattern is visible
                logger.LogInformation(
                    "OUTBOX → {EventType} for aggregate {AggregateId}: {Payload}",
                    evt.EventType, evt.AggregateId, evt.Payload);

                evt.ProcessedAt = DateTimeOffset.UtcNow;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to publish outbox event {Id}", evt.Id);
                // Leave ProcessedAt null so we retry next cycle
            }
        }

        await db.SaveChangesAsync(ct);
    }
}
