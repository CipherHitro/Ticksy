// ── Auth/AuthContextMiddleware.cs ────────────────────────────────────────────
// After JWT bearer validates the token, this middleware reads the claims
// and puts them into an AuthContext scoped to the request.
using System.Security.Claims;

namespace Ticksy.Payment.Api.Auth;

public sealed class AuthContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        if (ctx.User.Identity?.IsAuthenticated == true)
        {
            var sub   = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? ctx.User.FindFirstValue("sub")
                     ?? string.Empty;
            var email = ctx.User.FindFirstValue(ClaimTypes.Email)
                     ?? ctx.User.FindFirstValue("email")
                     ?? string.Empty;
            var name  = ctx.User.FindFirstValue(ClaimTypes.Name)
                     ?? ctx.User.FindFirstValue("name")
                     ?? string.Empty;
            var role  = ctx.User.FindFirstValue(ClaimTypes.Role)
                     ?? ctx.User.FindFirstValue("role")
                     ?? string.Empty;

            if (Guid.TryParse(sub, out var userId))
            {
                ctx.Items["AuthContext"] = new AuthContext
                {
                    UserId = userId,
                    Email  = email,
                    Name   = name,
                    Role   = role
                };
            }
        }
        await next(ctx);
    }
}

public static class AuthContextExtensions
{
    public static AuthContext? GetAuthContext(this HttpContext ctx) =>
        ctx.Items["AuthContext"] as AuthContext;

    public static AuthContext RequireAuthContext(this HttpContext ctx) =>
        ctx.GetAuthContext() ?? throw new UnauthorizedAccessException("Not authenticated");
}
