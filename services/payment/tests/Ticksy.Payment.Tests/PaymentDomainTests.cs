using Ticksy.Payment.Api.Domain;
using PaymentEntity = Ticksy.Payment.Api.Domain.Payment;

namespace Ticksy.Payment.Tests;

public class PaymentDomainTests
{
    [Fact]
    public void Payment_Created_HasInitialCreatedStatus()
    {
        var bookingId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var payment = new PaymentEntity(bookingId, userId, 50000, "INR", "order_123", "idemp_abc");

        Assert.NotEqual(Guid.Empty, payment.Id);
        Assert.Equal(bookingId, payment.BookingId);
        Assert.Equal(userId, payment.UserId);
        Assert.Equal(50000, payment.AmountMinor);
        Assert.Equal("INR", payment.Currency);
        Assert.Equal(PaymentStatus.CREATED, payment.Status);
        Assert.Equal("order_123", payment.ProviderOrderId);
        Assert.Equal("idemp_abc", payment.IdempotencyKey);
        Assert.Null(payment.ProviderPaymentId);
        Assert.Null(payment.ProviderSignature);
    }

    [Fact]
    public void Payment_MarkPaid_TransitionsToPaidAndStoresIdentifiers()
    {
        var payment = new PaymentEntity(Guid.NewGuid(), Guid.NewGuid(), 10000, "INR", "order_123", "idemp_1");
        var createdAt = payment.CreatedAt;

        payment.MarkPaid("pay_abc456", "sig_xyz789");

        Assert.Equal(PaymentStatus.PAID, payment.Status);
        Assert.Equal("pay_abc456", payment.ProviderPaymentId);
        Assert.Equal("sig_xyz789", payment.ProviderSignature);
        Assert.True(payment.UpdatedAt >= createdAt);
    }

    [Fact]
    public void Payment_MarkFailed_TransitionsToFailed()
    {
        var payment = new PaymentEntity(Guid.NewGuid(), Guid.NewGuid(), 10000, "INR", "order_123", "idemp_1");

        payment.MarkFailed();

        Assert.Equal(PaymentStatus.FAILED, payment.Status);
    }

    [Fact]
    public void Payment_MarkExpired_TransitionsToExpired()
    {
        var payment = new PaymentEntity(Guid.NewGuid(), Guid.NewGuid(), 10000, "INR", "order_123", "idemp_1");

        payment.MarkExpired();

        Assert.Equal(PaymentStatus.EXPIRED, payment.Status);
    }

    [Fact]
    public void Payment_MarkRefunded_TransitionsToRefunded()
    {
        var payment = new PaymentEntity(Guid.NewGuid(), Guid.NewGuid(), 10000, "INR", "order_123", "idemp_1");
        payment.MarkPaid("pay_123", "sig_123");

        payment.MarkRefunded();

        Assert.Equal(PaymentStatus.REFUNDED, payment.Status);
    }

    [Fact]
    public void Refund_MarkRefunded_UpdatesStatusAndProviderRefundId()
    {
        var paymentId = Guid.NewGuid();
        var refund = new Refund(paymentId, 10000, "Event cancelled");

        Assert.Equal(paymentId, refund.PaymentId);
        Assert.Equal(10000, refund.AmountMinor);
        Assert.Equal("Event cancelled", refund.Reason);
        Assert.Equal(RefundStatus.REFUND_PENDING, refund.Status);
        Assert.Null(refund.ProviderRefundId);

        refund.MarkRefunded("rfnd_test999");

        Assert.Equal(RefundStatus.REFUNDED, refund.Status);
        Assert.Equal("rfnd_test999", refund.ProviderRefundId);
    }

    [Fact]
    public void OutboxEvent_Created_InitializesCorrectly()
    {
        var outbox = new OutboxEvent("PaymentSucceeded", "agg-123", "{\"amount\": 5000}");

        Assert.NotEqual(Guid.Empty, outbox.Id);
        Assert.Equal("PaymentSucceeded", outbox.EventType);
        Assert.Equal("agg-123", outbox.AggregateId);
        Assert.Equal("{\"amount\": 5000}", outbox.Payload);
        Assert.Null(outbox.ProcessedAt);
    }

    [Fact]
    public void WebhookEvent_Created_StoresProviderEventId()
    {
        var webhook = new WebhookEvent("evt_abc123", "payment.captured", "{\"id\":\"pay_123\"}");

        Assert.NotEqual(Guid.Empty, webhook.Id);
        Assert.Equal("evt_abc123", webhook.ProviderEventId);
        Assert.Equal("payment.captured", webhook.EventType);
        Assert.Equal("{\"id\":\"pay_123\"}", webhook.RawBody);
    }
}
