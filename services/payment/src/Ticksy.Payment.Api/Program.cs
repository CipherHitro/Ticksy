// ── Program.cs ────────────────────────────────────────────────────────────────
// The entire application is configured here.
// In .NET the "builder" phase registers services (DI container),
// and the "app" phase adds middleware and maps routes.
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Prometheus;
using Serilog;
using Serilog.Formatting.Json;
using Ticksy.Payment.Api.Auth;
using Ticksy.Payment.Api.Data;
using Ticksy.Payment.Api.Endpoints;
using Ticksy.Payment.Api.Gateways;
using Ticksy.Payment.Api.Grpc;
using Ticksy.Payment.Api.Messaging;

// ── 0. Structured JSON logging with Serilog ──────────────────────────────────
// Serilog replaces the default Microsoft logger. JSON format matches the
// Ticksy convention: timestamp, level, service, requestId, message.
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(new ConfigurationBuilder()
        .AddJsonFile("appsettings.json")
        .AddEnvironmentVariables()
        .Build())
    .WriteTo.Console(new JsonFormatter())
    .Enrich.WithProperty("service", "payment")
    .CreateBootstrapLogger();

try
{
    Log.Information("Starting Ticksy Payment Service");

    var builder = WebApplication.CreateBuilder(args);

    // Use Serilog for all .NET log categories
    builder.Host.UseSerilog((ctx, services, cfg) => cfg
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .WriteTo.Console(new JsonFormatter())
        .Enrich.WithProperty("service", "payment"));

    // ── 1. Validate required environment variables ────────────────────────────
    // Environment variables (Docker Compose / Kubernetes) take precedence over static appsettings.json.
    var connString    = builder.Configuration["PAYMENT_DB_CONNECTION"]
        ?? builder.Configuration["ConnectionStrings__PaymentDb"]
        ?? builder.Configuration.GetConnectionString("PaymentDb")
        ?? throw new InvalidOperationException("ConnectionStrings:PaymentDb or PAYMENT_DB_CONNECTION is required");

    var dbHostLog = connString.Split(';')
        .FirstOrDefault(p => p.StartsWith("Host=", StringComparison.OrdinalIgnoreCase) || p.StartsWith("Server=", StringComparison.OrdinalIgnoreCase)) ?? "unknown";
    Log.Information("Targeting database: {DbTarget}", dbHostLog);

    var authServiceUrl = builder.Configuration["AUTH_SERVICE_URL"]
        ?? builder.Configuration["Jwt:AuthServiceUrl"]
        ?? "http://localhost:4001";

    var jwtIssuer     = builder.Configuration["JWT_ISSUER"]
        ?? builder.Configuration["Jwt:Issuer"]
        ?? "ticksy-auth";

    var jwtAudience   = builder.Configuration["JWT_AUDIENCE"]
        ?? builder.Configuration["Jwt:Audience"]
        ?? "ticksy-api";

    var metadataAddress = builder.Configuration["Jwt:MetadataAddress"]
        ?? builder.Configuration["AUTH_METADATA_ADDRESS"]
        ?? $"{authServiceUrl}/.well-known/openid-configuration";

    // ── 2. Database ───────────────────────────────────────────────────────────
    // EF Core + PostgreSQL (Npgsql). EnableRetryOnFailure handles transient failures.
    builder.Services.AddDbContext<PaymentDbContext>(opts =>
        opts.UseNpgsql(connString, npgsql => npgsql.EnableRetryOnFailure(3)));

    // ── 3. JWT Bearer Authentication (RS256, JWKS) ────────────────────────────
    // .NET's JwtBearer expects OIDC. Auth service exposes /.well-known/openid-configuration
    // pointing at /.well-known/jwks.json — so MetadataAddress does all the work.
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opts =>
        {
            opts.MetadataAddress      = metadataAddress;
            opts.RequireHttpsMetadata = builder.Configuration.GetValue<bool?>("JWT_REQUIRE_HTTPS_METADATA") 
                                     ?? builder.Configuration.GetValue<bool?>("Jwt:RequireHttpsMetadata") 
                                     ?? false;

            opts.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer           = true,
                ValidIssuer              = jwtIssuer,
                ValidateAudience         = true,
                ValidAudience            = jwtAudience,
                ValidateLifetime         = true,
                ClockSkew                = TimeSpan.FromSeconds(30),  // AGENTS.md § 6.4
                ValidAlgorithms          = ["RS256"],                  // RS256-only allowlist
                ValidateIssuerSigningKey = true,
            };

            // Standard Ticksy error shape for 401/403 instead of .NET defaults
            opts.Events = new JwtBearerEvents
            {
                OnChallenge = async ctx =>
                {
                    ctx.HandleResponse();
                    ctx.Response.StatusCode  = 401;
                    ctx.Response.ContentType = "application/json";
                    await ctx.Response.WriteAsJsonAsync(new ErrorEnvelope(
                        false, "UNAUTHENTICATED", "Authorization token is required", ctx.HttpContext.TraceIdentifier));
                },
                OnForbidden = async ctx =>
                {
                    ctx.Response.StatusCode  = 403;
                    ctx.Response.ContentType = "application/json";
                    await ctx.Response.WriteAsJsonAsync(new ErrorEnvelope(
                        false, "FORBIDDEN", "You do not have permission to access this resource", ctx.HttpContext.TraceIdentifier));
                }
            };
        });

    builder.Services.AddAuthorization();

    // ── 4. Application services ───────────────────────────────────────────────
    builder.Services.AddSingleton<IRazorpayGateway, RazorpayGateway>();
    builder.Services.AddHostedService<OutboxWorker>();

    // ── 5. gRPC ───────────────────────────────────────────────────────────────
    builder.Services.AddGrpc();

    // ── 6. Health checks ──────────────────────────────────────────────────────
    builder.Services.AddHealthChecks()
        .AddDbContextCheck<PaymentDbContext>("postgres");

    // ── 7. JSON serialization ─────────────────────────────────────────────────
    // camelCase field names + enums as strings ("PAID" not 2)
    builder.Services.ConfigureHttpJsonOptions(opts =>
    {
        opts.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

    // ── 8. Exception handler (must be registered before Build) ───────────────
    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
    builder.Services.AddProblemDetails();

    // ── 9. Two Kestrel endpoints ──────────────────────────────────────────────
    // HTTP (4004) for REST, HTTP/2 (50054) for gRPC.
    // Plaintext gRPC requires its own HTTP/2-only port.
    builder.WebHost.ConfigureKestrel(kestrel =>
    {
        kestrel.ListenAnyIP(int.Parse(builder.Configuration["PORT"] ?? builder.Configuration["Ports:Http"] ?? "4004"));
        kestrel.ListenAnyIP(int.Parse(builder.Configuration["GRPC_PORT"] ?? builder.Configuration["Ports:Grpc"] ?? "50054"),
            o => o.Protocols = Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http2);
    });

    // ──────────────────────────────────────────────────────────────────────────
    var app = builder.Build();
    // ──────────────────────────────────────────────────────────────────────────

    // ── Middleware pipeline (order matters) ───────────────────────────────────
    app.UseExceptionHandler();                  // catch unhandled exceptions
    app.UseRouting();
    app.UseAuthentication();                    // validate JWT
    app.UseAuthorization();                     // enforce [Authorize]
    app.UseMiddleware<AuthContextMiddleware>();  // populate AuthContext from claims

    // ── HTTP routes ───────────────────────────────────────────────────────────
    // Webhook must be first so raw body is readable before any parsing
    app.MapWebhookEndpoints();
    app.MapPaymentEndpoints();

    // ── Health ────────────────────────────────────────────────────────────────
    app.MapGet("/health/live",  () => Results.Ok(new { success = true, status = "ok" }));
    app.MapHealthChecks("/health/ready");

    // ── Metrics ───────────────────────────────────────────────────────────────
    app.MapMetrics("/metrics");   // Prometheus scrape endpoint

    // ── gRPC ──────────────────────────────────────────────────────────────────
    app.MapGrpcService<PaymentGrpcService>();

    // ── Run DB migrations on startup ─────────────────────────────────────────
    // Retries on startup so the container can wait for SQL Server to accept connections
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<PaymentDbContext>();
        var retries = 10;
        while (retries > 0)
        {
            try
            {
                await db.Database.MigrateAsync();
                Log.Information("Database migrations applied successfully");
                break;
            }
            catch (Exception ex) when (retries > 1)
            {
                retries--;
                Log.Warning("Database connection failed during startup migration ({Message}). Retrying in 3s... ({RetriesLeft} attempts left)", ex.Message, retries);
                await Task.Delay(3000);
            }
        }
    }

    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Payment service crashed on startup");
}
finally
{
    await Log.CloseAndFlushAsync();
}
