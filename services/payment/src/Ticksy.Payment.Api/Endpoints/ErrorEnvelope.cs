// ── Endpoints/ErrorEnvelope.cs ───────────────────────────────────────────────
// The standard Ticksy error shape used by EVERY error response.
// Matches the contract defined in AGENTS.md § 5.4.
namespace Ticksy.Payment.Api.Endpoints;

public sealed record ErrorEnvelope(
    bool   Success,
    string Code,
    string Message,
    string RequestId);

public sealed record SuccessEnvelope<T>(
    bool Success,
    T    Data);
