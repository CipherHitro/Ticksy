// ── Data/PaymentDbContext.cs ─────────────────────────────────────────────────
// Entity Framework Core context — the single gateway to the SQL Server DB.
// EF Core translates C# LINQ queries into SQL, handles migrations, and
// tracks entity changes so we know what UPDATE statements to emit.
using Microsoft.EntityFrameworkCore;
using Ticksy.Payment.Api.Domain;

namespace Ticksy.Payment.Api.Data;

public class PaymentDbContext(DbContextOptions<PaymentDbContext> options)
    : DbContext(options)
{
    public DbSet<Domain.Payment>   Payments      => Set<Domain.Payment>();
    public DbSet<Refund>           Refunds        => Set<Refund>();
    public DbSet<WebhookEvent>     WebhookEvents  => Set<WebhookEvent>();
    public DbSet<OutboxEvent>      OutboxEvents   => Set<OutboxEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // ── Payment ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Domain.Payment>(e =>
        {
            e.HasKey(p => p.Id);

            // A booking should only have ONE payment at a time
            e.HasIndex(p => p.BookingId).IsUnique();

            // Razorpay order IDs must be globally unique
            e.HasIndex(p => p.ProviderOrderId).IsUnique();

            // Idempotency key unique per payment row
            e.HasIndex(p => p.IdempotencyKey).IsUnique();

            // Optimistic concurrency token
            e.Property(p => p.Version).IsConcurrencyToken();

            e.Property(p => p.Status)
             .HasConversion<string>()   // stored as "PAID" not 2 in DB
             .HasMaxLength(20);

            e.Property(p => p.Currency).HasMaxLength(3);
            e.Property(p => p.ProviderOrderId).HasMaxLength(100);
            e.Property(p => p.ProviderPaymentId).HasMaxLength(100);
            e.Property(p => p.ProviderSignature).HasMaxLength(256);
            e.Property(p => p.IdempotencyKey).HasMaxLength(64);
        });

        // ── Refund ───────────────────────────────────────────────────────────
        modelBuilder.Entity<Refund>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => r.ProviderRefundId).IsUnique().HasFilter("\"ProviderRefundId\" IS NOT NULL");
            e.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(r => r.Reason).HasMaxLength(500);
            e.Property(r => r.ProviderRefundId).HasMaxLength(100);
        });

        // ── WebhookEvent ─────────────────────────────────────────────────────
        modelBuilder.Entity<WebhookEvent>(e =>
        {
            e.HasKey(w => w.Id);
            // Unique constraint on provider event ID — the deduplication guard
            e.HasIndex(w => w.ProviderEventId).IsUnique();
            e.Property(w => w.ProviderEventId).HasMaxLength(100);
            e.Property(w => w.EventType).HasMaxLength(100);
        });

        // ── OutboxEvent ──────────────────────────────────────────────────────
        modelBuilder.Entity<OutboxEvent>(e =>
        {
            e.HasKey(o => o.Id);
            e.HasIndex(o => o.ProcessedAt);   // background worker queries WHERE ProcessedAt IS NULL
            e.Property(o => o.EventType).HasMaxLength(100);
            e.Property(o => o.AggregateId).HasMaxLength(64);
        });
    }
}
