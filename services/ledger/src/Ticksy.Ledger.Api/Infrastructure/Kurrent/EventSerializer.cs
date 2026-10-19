// ── Infrastructure/Kurrent/EventSerializer.cs ─────────────────────────────────
// Maps between AccountEvent domain records and KurrentDB EventData / ResolvedEvent.
using KurrentDB.Client;
using System.Text;
using System.Text.Json;
using Ticksy.Ledger.Api.Domain;

namespace Ticksy.Ledger.Api.Infrastructure.Kurrent;

public static class EventSerializer
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static EventData ToEventData(AccountEvent evt)
    {
        var typeName = evt.GetType().Name;
        var dataBytes = JsonSerializer.SerializeToUtf8Bytes(evt, evt.GetType(), JsonOpts);
        var metaBytes = JsonSerializer.SerializeToUtf8Bytes(evt.Metadata, JsonOpts);

        return new EventData(
            Uuid.NewUuid(),
            typeName,
            dataBytes,
            metaBytes);
    }

    public static AccountEvent? ToDomainEvent(ResolvedEvent resolved)
    {
        var eventType = resolved.Event.EventType;
        var dataJson = Encoding.UTF8.GetString(resolved.Event.Data.Span);

        return eventType switch
        {
            nameof(SaleRecorded)    => JsonSerializer.Deserialize<SaleRecorded>(dataJson, JsonOpts),
            nameof(SaleRefunded)    => JsonSerializer.Deserialize<SaleRefunded>(dataJson, JsonOpts),
            nameof(PayoutRequested) => JsonSerializer.Deserialize<PayoutRequested>(dataJson, JsonOpts),
            nameof(PayoutCompleted) => JsonSerializer.Deserialize<PayoutCompleted>(dataJson, JsonOpts),
            nameof(PayoutFailed)    => JsonSerializer.Deserialize<PayoutFailed>(dataJson, JsonOpts),
            _                       => null
        };
    }
}
