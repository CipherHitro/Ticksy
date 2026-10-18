// ── Domain/OutboxEvent.cs ────────────────────────────────────────────────────
// Transactional outbox pattern: domain events are written in the SAME
// DB transaction as the state change. A background worker picks them up
// and publishes to Kafka (or RabbitMQ). This guarantees at-least-once
// delivery without distributed transactions.
namespace Ticksy.Payment.Api.Domain;

public class OutboxEvent
{
    public Guid           Id          { get; private set; } = Guid.NewGuid();
    public string         EventType   { get; private set; } = string.Empty;  // e.g. "PaymentSucceeded"
    public string         AggregateId { get; private set; } = string.Empty;  // payment ID
    public string         Payload     { get; private set; } = string.Empty;  // JSON
    public DateTimeOffset OccurredAt  { get; private set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ProcessedAt { get; set; }                         // null = not yet sent

    private OutboxEvent() { }

    public OutboxEvent(string eventType, string aggregateId, string payload)
    {
        EventType   = eventType;
        AggregateId = aggregateId;
        Payload     = payload;
    }
}
