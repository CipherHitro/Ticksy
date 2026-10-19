// ── Endpoints/ErrorEnvelope.cs ────────────────────────────────────────────────
// The standard response envelopes mandated by AGENTS.md § 5.3 & 5.4.
namespace Ticksy.Ledger.Api.Endpoints;

public sealed record ErrorEnvelope(
    bool Success,
    string Code,
    string Message,
    string RequestId,
    IReadOnlyList<ValidationErrorDetail>? Details = null);

public sealed record ValidationErrorDetail(string Field, string Message);

public sealed record SuccessEnvelope<T>(
    bool Success,
    T Data,
    object? Meta = null);
