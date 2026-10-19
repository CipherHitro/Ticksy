// ── Auth/AuthContext.cs ────────────────────────────────────────────────────────
// Encapsulates the caller's verified JWT identity.
using System.Security.Claims;

namespace Ticksy.Ledger.Api.Auth;

public sealed record AuthContext(
    Guid UserId,
    string Email,
    string Name,
    string Role)
{
    public bool IsAdmin => Role == "ADMIN";
    public bool IsOrganizer => Role == "ORGANIZER";
    public bool IsOwner(Guid resourceOwnerId) => UserId == resourceOwnerId;
}

public static class HttpContextAuthExtensions
{
    private const string ItemKey = "TicksyAuthContext";

    public static void SetAuthContext(this HttpContext ctx, AuthContext auth) =>
        ctx.Items[ItemKey] = auth;

    public static AuthContext? GetAuthContext(this HttpContext ctx) =>
        ctx.Items.TryGetValue(ItemKey, out var val) ? val as AuthContext : null;

    public static AuthContext RequireAuthContext(this HttpContext ctx) =>
        ctx.GetAuthContext() ?? throw new UnauthorizedAccessException("Missing authentication context");
}
