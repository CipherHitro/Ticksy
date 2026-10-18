// ── Auth/AuthContext.cs ──────────────────────────────────────────────────────
// Extracted from the validated JWT. Every controller reads from this
// instead of parsing claims manually. Populated by AuthContextMiddleware.
namespace Ticksy.Payment.Api.Auth;

public sealed class AuthContext
{
    public Guid   UserId { get; init; }
    public string Email  { get; init; } = string.Empty;
    public string Name   { get; init; } = string.Empty;
    public string Role   { get; init; } = string.Empty;

    public bool IsAdmin => Role == "ADMIN";
    public bool IsOwner(Guid resourceUserId) => UserId == resourceUserId;
}
