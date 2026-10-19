// ── Program.cs ───────────────────────────────────────────────────────────────
// Ticksy Ledger Service entry point.
// Event Sourcing (KurrentDB) + CQRS (Redis) for organizer accounts and platform finances.
using KurrentDB.Client;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Prometheus;
using Serilog;
using Serilog.Formatting.Json;
using StackExchange.Redis;
using System.Text.Json.Serialization;
using Ticksy.Ledger.Api.Application;
using Ticksy.Ledger.Api.Auth;
using Ticksy.Ledger.Api.Endpoints;
using Ticksy.Ledger.Api.Infrastructure.Redis;
using Ticksy.Ledger.Api.Projections;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(new JsonFormatter())
    .Enrich.WithProperty("service", "ledger")
    .CreateBootstrapLogger();

try
{
    Log.Information("Starting Ticksy Ledger Service");

    var builder = WebApplication.CreateBuilder(args);

    // Serilog JSON logging
    builder.Host.UseSerilog((ctx, services, cfg) => cfg
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .WriteTo.Console(new JsonFormatter())
        .Enrich.WithProperty("service", "ledger"));

    // ── 1. Configuration & Env Vars ───────────────────────────────────────────
    var httpPort = builder.Configuration["PORT"]
        ?? builder.Configuration["Ports:Http"]
        ?? "4005";

    builder.WebHost.UseKestrel(opts =>
    {
        opts.ListenAnyIP(int.Parse(httpPort));
    });

    var kurrentConnStr = builder.Configuration["KURRENTDB_CONNECTION"]
        ?? builder.Configuration.GetConnectionString("KurrentDb")
        ?? "kurrentdb://localhost:2113?tls=false";

    var redisConnStr = builder.Configuration["REDIS_CONNECTION"]
        ?? builder.Configuration.GetConnectionString("Redis")
        ?? "localhost:6381";

    var authServiceUrl = builder.Configuration["AUTH_SERVICE_URL"]
        ?? builder.Configuration["Jwt:AuthServiceUrl"]
        ?? "http://localhost:4001";

    var jwtIssuer = builder.Configuration["JWT_ISSUER"]
        ?? builder.Configuration["Jwt:Issuer"]
        ?? "ticksy-auth";

    var jwtAudience = builder.Configuration["JWT_AUDIENCE"]
        ?? builder.Configuration["Jwt:Audience"]
        ?? "ticksy-api";

    var metadataAddress = builder.Configuration["Jwt:MetadataAddress"]
        ?? $"{authServiceUrl}/.well-known/openid-configuration";

    // ── 2. Infrastructure Services ────────────────────────────────────────────
    builder.Services.AddSingleton(_ =>
    {
        var settings = KurrentDBClientSettings.Create(kurrentConnStr);
        return new KurrentDBClient(settings);
    });

    builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
        ConnectionMultiplexer.Connect(redisConnStr));

    builder.Services.AddSingleton<IAccountRepository, AccountRepository>();
    builder.Services.AddSingleton<IAccountCommandHandler, AccountCommandHandler>();
    builder.Services.AddSingleton<IRedisReadModelStore, RedisReadModelStore>();

    // Background projection host
    builder.Services.AddHostedService<ProjectionHost>();

    // ── 3. Authentication (JWT RS256 with JWKS) ───────────────────────────────
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opts =>
        {
            opts.MetadataAddress = metadataAddress;
            opts.RequireHttpsMetadata = false;

            opts.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = jwtIssuer,
                ValidateAudience = true,
                ValidAudience = jwtAudience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                ValidAlgorithms = ["RS256"],
                ValidateIssuerSigningKey = true
            };

            opts.Events = new JwtBearerEvents
            {
                OnChallenge = async ctx =>
                {
                    ctx.HandleResponse();
                    ctx.Response.StatusCode = 401;
                    ctx.Response.ContentType = "application/json";
                    await ctx.Response.WriteAsJsonAsync(new ErrorEnvelope(
                        false, "UNAUTHENTICATED", "Authentication token is missing, invalid, or expired", ctx.HttpContext.TraceIdentifier));
                },
                OnForbidden = async ctx =>
                {
                    ctx.Response.StatusCode = 403;
                    ctx.Response.ContentType = "application/json";
                    await ctx.Response.WriteAsJsonAsync(new ErrorEnvelope(
                        false, "FORBIDDEN", "You do not have permission to access this resource", ctx.HttpContext.TraceIdentifier));
                }
            };
        });

    builder.Services.AddAuthorization();

    // ── 4. Exception Handling & JSON ──────────────────────────────────────────
    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
    builder.Services.AddProblemDetails();

    builder.Services.ConfigureHttpJsonOptions(opts =>
    {
        opts.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

    var app = builder.Build();

    app.UseExceptionHandler();

    // Request ID header propagation (AGENTS.md § 5.7)
    app.Use(async (context, next) =>
    {
        if (!context.Request.Headers.TryGetValue("X-Request-Id", out var reqId) || string.IsNullOrWhiteSpace(reqId))
        {
            reqId = Guid.NewGuid().ToString("D");
        }
        context.TraceIdentifier = reqId!;
        context.Response.Headers["X-Request-Id"] = reqId;
        await next();
    });

    app.UseAuthentication();
    app.UseMiddleware<AuthContextMiddleware>();
    app.UseAuthorization();

    // Prometheus metrics
    app.UseMetricServer("/metrics");
    app.UseHttpMetrics();

    // ── Health Endpoints (Docker & Kubernetes) ────────────────────────────────
    app.MapGet("/health/live", () => Results.Ok(new { status = "UP", service = "ledger" }));

    app.MapGet("/health/ready", async (
        KurrentDBClient kurrent,
        IConnectionMultiplexer redis,
        HttpContext ctx) =>
    {
        var checks = new Dictionary<string, string>();
        var isHealthy = true;

        // Check Redis
        try
        {
            var db = redis.GetDatabase();
            await db.PingAsync();
            checks["redis"] = "UP";
        }
        catch (Exception ex)
        {
            checks["redis"] = $"DOWN ({ex.Message})";
            isHealthy = false;
        }

        // Check KurrentDB
        try
        {
            // Lightweight read attempt to test connection
            var read = kurrent.ReadStreamAsync(Direction.Forwards, "$users", KurrentDB.Client.StreamPosition.Start, maxCount: 1);
            await read.ReadState;
            checks["kurrentdb"] = "UP";
        }
        catch (Exception ex)
        {
            checks["kurrentdb"] = $"DOWN ({ex.Message})";
            isHealthy = false;
        }

        return isHealthy
            ? Results.Ok(new { status = "READY", service = "ledger", checks })
            : Results.Json(new { status = "UNHEALTHY", service = "ledger", checks }, statusCode: 503);
    });

    // ── Domain Endpoints ──────────────────────────────────────────────────────
    app.MapOrganizerEndpoints();
    app.MapAdminEndpoints();
    app.MapDevEndpoints(app.Environment);

    Log.Information("Ledger Service listening on port {Port}", httpPort);
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Ledger Service terminated unexpectedly");
    throw;
}
finally
{
    Log.CloseAndFlush();
}
