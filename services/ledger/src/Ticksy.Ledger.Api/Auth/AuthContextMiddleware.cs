// ── Auth/AuthContextMiddleware.cs ──────────────────────────────────────────────
// Runs after UseAuthentication() and extracts verified claims into AuthContext.
using System.Security.Claims;

namespace Ticksy.Ledger.Api.Auth;

public sealed class AuthContextMiddleware(RequestDelegate next, ILogger<AuthContextMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var sub = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                   ?? context.User.FindFirstValue("sub");

            var email = context.User.FindFirstValue(ClaimTypes.Email)
                     ?? context.User.FindFirstValue("email")
                     ?? "";

            var name  = context.User.FindFirstValue(ClaimTypes.Name)
                     ?? context.User.FindFirstValue("name")
                     ?? "";

            var role  = context.User.FindFirstValue(ClaimTypes.Role)
                     ?? context.User.FindFirstValue("role")
                     ?? "ATTENDEE";

            if (Guid.TryParse(sub, out var userId))
            {
                var authContext = new AuthContext(userId, email, name, role);
                context.SetAuthContext(authContext);
            }
            else
            {
                logger.LogWarning("Authenticated user has non-Guid sub: {Sub}", sub);
            }
        }

        await next(context);
    }
}
