// ── Domain/WebhookEvent.cs ───────────────────────────────────────────────────
// Tracks provider webhook events. Unique on ProviderEventId so we can
// deduplicate re-delivered webhooks (Razorpay guarantees at-least-once).
namespace Ticksy.Payment.Api.Domain;

public class WebhookEvent
{
    public Guid           Id              { get; private set; } = Guid.NewGuid();
    public string         ProviderEventId { get; private set; } = string.Empty;
    public string         EventType       { get; private set; } = string.Empty;
    public string         RawBody         { get; private set; } = string.Empty;
    public DateTimeOffset ReceivedAt      { get; private set; } = DateTimeOffset.UtcNow;

    private WebhookEvent() { }

    public WebhookEvent(string providerEventId, string eventType, string rawBody)
    {
        ProviderEventId = providerEventId;
        EventType       = eventType;
        RawBody         = rawBody;
    }
}
